"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useCallback,
} from "react";
import { usePorcupine } from "@picovoice/porcupine-react";
import { useMicVAD } from "@ricky0123/vad-react";
import { toast } from "sonner";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
import { micReducer, type MicState } from "@/lib/voice/mic-state";
import { useClapDetector } from "@/lib/voice/use-clap-detector";
import { usePressToTalk } from "@/lib/voice/use-press-to-talk";
import {
  AUDIO_CONSTRAINTS,
  VAD_BASE_ASSET_PATH,
} from "@/lib/voice/constants";
import { encodeWav } from "@/lib/voice/encode-wav";
import { useTtsPlayer } from "@/lib/voice/use-tts-player";
import { publishMicState } from "@/lib/voice/mic-state-bus";
// Phase 9 / TEL-01 — flushNow is the TTS_END safety net for partial telemetry
// (e.g. barge-in before audio_first_play_at). NOTE: do NOT import collectStage
// here — vad_end_at is captured LOCALLY in onSpeechEnd and piped through the
// jarvis-voice-transcript event detail. Calling collectStage in onSpeechEnd
// would no-op (activeTurnId is unbound until onTurnStart fires after the
// /api/jarvis stream opens) and silently drop vad_end_at on every turn.
import { flushNow } from "@/lib/voice/voice-stage-collector";
import { stripWakeWord, stripWakeWordAnywhere } from "@/lib/voice/wake-word";
import {
  getSharedAudioContext,
  unlockAudioContext,
} from "@/lib/voice/audio-context";

/**
 * Phase 7 Plan 07-03 — owns Porcupine + VAD + clap-onset + press-to-talk lifecycles.
 *
 * MUST be dynamic-imported with ssr: false from app/(app)/layout.tsx
 * (Porcupine + vad-web both crash on SSR — Pitfall 2).
 *
 * The 5-state FSM lives here via useReducer (no global store — CLAUDE.md).
 * The current state is published to a module-level subscriber set so
 * MicIndicatorDot can read it without prop-drilling or a Context provider.
 * Pattern lifted from apps/web/lib/jarvis/focus.ts dispatch singleton.
 *
 * Mount contract (always-mounted when voiceEnabled):
 *   - JarvisListener mounts whenever voiceEnabled=true — even in Discreet mode.
 *   - Reason: Cmd+Shift+J press-to-talk (VOICE-09 / CRITICAL_PHASE7_CONCERNS #10)
 *     must arm the FSM in Discreet mode. Mounting is gated on voiceEnabled only.
 *   - Inside the listener: wakeWordActive = voiceEnabled && !discreetMode (Porcupine gated).
 *   - pressToTalkActive = voiceEnabled (NOT gated on discreetMode).
 */

// Pub-sub for the mic FSM lives in lib/voice/mic-state-bus.ts so consumers
// (PersistentNav → MicIndicatorDot) can subscribe without dragging Porcupine
// + vad-react + onnxruntime-web into the SSR bundle (defeats ssr:false gate).

export function JarvisListener() {
  const { settings, mounted } = useVoiceSettings();
  const [micState, dispatch] = useReducer(micReducer, "idle");
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Phase 7 Plan 07-04: TTS playback hook (ElevenLabs → SpeechSynthesis fallback).
  const ttsPlayer = useTtsPlayer();

  // Ref-mirror of micState so VAD callbacks (which capture stale closures
  // via vad-react's internal hook structure) can read the current FSM state.
  const micStateRef = useRef<MicState>("idle");

  // Follow-up window: 5 seconds after each JARVIS response (TTS_END), the
  // user can speak without prefixing "Hey Jarvis". Window closes naturally
  // when the timestamp elapses; another response opens a fresh 5-second
  // window. Lets you chain commands in a conversation.
  const followUpUntilRef = useRef<number>(0);
  const FOLLOW_UP_MS = 5000;

  // Abort controller for the in-flight STT request — cancelled when the
  // user fires `jarvis-cancel` (stop button while active). Re-allocated
  // on each onSpeechEnd.
  const sttAbortRef = useRef<AbortController | null>(null);

  // Which channel armed this recording session — set when we leave
  // "listening" and read in onSpeechEnd to decide whether to check the
  // wake-word prefix in the transcript. Lets the wake-word path share
  // the SAME FSM transitions as press-to-talk so the bubble glows the
  // moment speech is detected, instead of after STT confirms.
  const activationSourceRef = useRef<
    "wake-word" | "follow-up" | "press-to-talk" | "clap" | "porcupine" | null
  >(null);

  // One-shot guard for the "audio locked" toast — prevents spamming the
  // toast on every TTS attempt while the user hasn't clicked anything.
  const audioLockWarnedRef = useRef(false);

  // Phase 10 Plan 10-04 — per-turn isVoice flag. Tracks whether the user's
  // input for THIS turn was voice (vs typed). Set on the first per-sentence
  // dispatch and read by handleEndOfTurn to decide whether to open the 5s
  // follow-up window. Default false until the first sentence asserts it.
  const turnIsVoiceRef = useRef(false);

  // Auto-shutoff timer — if the user triggers an activation (press-to-talk,
  // clap, follow-up enter) but no speech is detected within 8s, return to
  // listening. Prevents the bubble from glowing forever after an accidental
  // tap or a Porcupine misfire that the user doesn't follow up on.
  const noSpeechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ~10s no-speech auto-disengage (#315). On web this is the PRIMARY silent-
  // turn guard: Silero VAD never fires onSpeechEnd for pure silence, so a mic
  // engaged into silence would otherwise sit in "recording" forever. Fires
  // quietly — ERROR → listening, no message, no TTS.
  const NO_SPEECH_TIMEOUT_MS = 10_000;

  // True while VAD is currently detecting speech (between onSpeechStart and
  // onSpeechEnd). Gates the clap detector: plosive consonants ('t', 'p', 'k',
  // 'b', 'd') in normal speech produce transient amplitude peaks that satisfy
  // the AudioWorklet clap-onset thresholds, and with the 250-650ms inter-clap
  // window two adjacent plosives in one utterance routinely trip onDoubleClap.
  // Claps are silence-gated by definition — if VAD is currently speaking, the
  // "clap" is a plosive, not a clap. Suppress.
  //
  // Discovered via debug session jarvis-follow-up-window-leak: spurious clap
  // dispatches were overwriting activationSource "wake-word" → "clap" mid-
  // utterance, moving the FSM to recording, and causing onSpeechEnd to fall
  // through to the press-to-talk default (no wake-word gate) — turning every
  // post-window utterance into a command.
  const vadSpeakingRef = useRef(false);

  // Whether on-device wake-word (Porcupine) is configured. When it is, the
  // Whisper-keyword fallback path is OFF — ambient speech in "listening"
  // outside the follow-up window does NOT hit Groq STT. Porcupine fires
  // on-device, no audio leaves the browser unless the wake word is detected.
  const hasPorcupineWakeWord = Boolean(
    process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY,
  );

  // Tracks the prior FSM state so we can detect the transition INTO
  // "listening" — Phase 11 / CACHE-04 uses this edge as the "mic-arm"
  // signal for the predictive cache warmer.
  const prevMicStateRef = useRef<MicState | null>(null);

  // Publish FSM state changes so MicIndicatorDot (separate tree) stays in sync.
  useEffect(() => {
    const prev = prevMicStateRef.current;
    micStateRef.current = micState;
    publishMicState(micState);
    // Phase 11 / CACHE-04 — emit a window event on the edge into "listening"
    // so JarvisWarmer can prime the Anthropic cache. The publishMicState bus
    // only carries app-internal FSM updates; the window event is the
    // cross-cutting cache signal. Edge-only (prev !== "listening") so a long
    // stay in "listening" doesn't exhaust the JarvisWarmer 30s debounce in
    // vain.
    if (prev !== "listening" && micState === "listening") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("mic-arm"));
      }
    }
    prevMicStateRef.current = micState;
  }, [micState]);

  // Start a ~10s no-speech timer on every entry into "recording" — that's
  // the state press-to-talk, clap, and the follow-up speech-start all land
  // in. If VAD detects speech before the timer fires, onSpeechStart clears
  // it. Otherwise the system ERRORs back to "listening" — bubble fades,
  // FSM resets, ready for the next trigger.
  useEffect(() => {
    if (noSpeechTimeoutRef.current) {
      clearTimeout(noSpeechTimeoutRef.current);
      noSpeechTimeoutRef.current = null;
    }
    if (micState === "recording") {
      noSpeechTimeoutRef.current = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log("[jarvis] auto-shutoff: no speech within 10s");
        dispatch({ type: "ERROR", reason: "no-speech-timeout" });
        noSpeechTimeoutRef.current = null;
      }, NO_SPEECH_TIMEOUT_MS);
    }
    return () => {
      if (noSpeechTimeoutRef.current) {
        clearTimeout(noSpeechTimeoutRef.current);
        noSpeechTimeoutRef.current = null;
      }
    };
  }, [micState]);

  // ─── Gate computations ───────────────────────────────────────────────────
  // Phase 7 revised model — two independent flags:
  //   voiceEnabled  = "aware mode" — wake-word + clap + press-to-talk listening
  //   discreetMode  = mute — silences TTS playback only
  // Listening is gated on voiceEnabled alone. Discreet does NOT stop the mic.
  // The TTS gate lives in handleVoiceSpeak (settings.discreetMode short-circuit).
  const listenActive = mounted && settings.voiceEnabled;
  const pressToTalkActive = mounted && settings.voiceEnabled;
  // wakeWordActive is kept for the Porcupine gate (separate engine, not used in
  // the Whisper-keyword path); only relevant when a Picovoice key is configured.
  const wakeWordActive = listenActive && !settings.discreetMode;

  // ─── Voice enabled/disabled FSM transition ───────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    if (settings.voiceEnabled) {
      dispatch({ type: "VOICE_ENABLED" });
    } else {
      dispatch({ type: "VOICE_DISABLED" });
    }
  }, [mounted, settings.voiceEnabled]);

  // ─── First-gesture AudioContext unlock ───────────────────────────────────
  // When voiceEnabled defaults to true (aware mode), users never click the
  // EnableVoiceModal's "Enable" button — so the AudioContext stays suspended
  // in Safari and TTS plays silently. Hook the first ANY user interaction
  // (click / keydown / touch) to unlock the shared AudioContext.
  useEffect(() => {
    if (!pressToTalkActive) return;
    if (getSharedAudioContext()) return; // already unlocked elsewhere

    let unlocked = false;
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      void unlockAudioContext().catch((err) => {
        console.warn("[jarvis-listener] first-gesture audio unlock failed", err);
      });
    }
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [pressToTalkActive]);

  // ─── Mic stream acquisition ───────────────────────────────────────────────
  // Acquire (and hold) the mic stream whenever voice is enabled. Discreet
  // mode does NOT release the mic — we still listen, just don't speak back.
  useEffect(() => {
    if (!listenActive) return;

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...AUDIO_CONSTRAINTS,
            ...(settings.micDeviceId
              ? { deviceId: { exact: settings.micDeviceId } }
              : {}),
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Reuse the shared AudioContext unlocked by EnableVoiceModal /
        // PressToTalkButton click. Creating a fresh AudioContext here
        // (outside a user gesture) would leave it suspended in Safari and
        // any decodeAudioData → bufferSource.start() chain would produce
        // silence with no error.
        const shared = getSharedAudioContext();
        if (shared) {
          audioContextRef.current = shared;
        } else {
          console.warn(
            "[jarvis-listener] no shared AudioContext yet — TTS will be silent until a user-gesture unlock",
          );
        }
      } catch (err) {
        console.error("[jarvis-listener] mic acquisition failed", err);
        dispatch({ type: "ERROR", reason: "mic-acquisition" });
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [listenActive, settings.micDeviceId]);

  // ─── Porcupine wake-word ──────────────────────────────────────────────────
  // Armed when wakeWordActive AND PICOVOICE key is present.
  //
  // Pitfall 3: Porcupine MUST be suspended while state==='speaking' so
  // JARVIS's own TTS voice doesn't re-trigger the wake-word.
  const porcupine = usePorcupine();

  useEffect(() => {
    if (!wakeWordActive || !process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY) return;

    porcupine
      .init(
        process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY!,
        // "Jarvis" is a built-in keyword provided by Picovoice.
        [{ builtin: "Jarvis" as unknown as never }],
        { publicPath: "/porcupine_params.pv" },
      )
      .catch((e) => {
        console.error("[porcupine] init failed — ensure NEXT_PUBLIC_PICOVOICE_ACCESS_KEY is set and porcupine_params.pv is in /public", e);
      });

    return () => {
      porcupine.release?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeWordActive]);

  // Porcupine fired a keyword: arm the activation source ref AND fire the
  // visual burst immediately so the bubble lights up the instant the wake
  // phrase is detected (matching press-to-talk's instant feedback). We do
  // NOT transition state here — onSpeechEnd is what cross-validates against
  // Whisper and decides whether to dispatch a command. On a misfire (the
  // bubble glows but no real wake word was spoken), the wake-burst's 4s
  // tentativelyActive timer expires naturally and the bubble fades back
  // to ambient.
  //
  // De-dupe by reference: this effect re-fires on every micState change
  // (listening → thinking → speaking → listening …), and `keywordDetection`
  // from a previous wake stays set on the hook between renders. Without
  // the ref check, the effect would re-arm activationSource on every cycle
  // back to "listening", making the NEXT ambient utterance look like a
  // Porcupine wake even though Porcupine hadn't fired in this round.
  const lastPorcupineDetectionRef = useRef<unknown>(null);
  useEffect(() => {
    if (!porcupine.keywordDetection) return;
    if (micState !== "listening") return;
    if (porcupine.keywordDetection === lastPorcupineDetectionRef.current) return;
    lastPorcupineDetectionRef.current = porcupine.keywordDetection;
    activationSourceRef.current = "porcupine";
    window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));
  }, [porcupine.keywordDetection, micState]);

  // Pitfall 3 — pause Porcupine while speaking to defeat acoustic feedback.
  // Re-arm on transition to listening.
  useEffect(() => {
    if (micState === "speaking") {
      porcupine.stop?.();
    } else if (micState === "listening") {
      porcupine.start?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micState]);

  // ─── VAD (voice activity detection) ──────────────────────────────────────
  // onSpeechStart handles barge-in; onSpeechEnd flushes for STT.
  const vad = useMicVAD({
    // startOnLoad MUST be true: with `false`, vad-react defers stream acquisition
    // until vad.start() is called — but React StrictMode's destroy/remount cycle
    // tears down the stream before we can use it, leaving the surviving instance
    // permanently errored ("MicVAD has null stream, audio context, or processor
    // adapter"). Running continuously and gating responses via the FSM in the
    // onSpeech* callbacks is the only reliable pattern under StrictMode.
    startOnLoad: true,
    // baseAssetPath: library constructs URL as baseAssetPath + "silero_vad_legacy.onnx"
    // (model="legacy" is vad-web's DEFAULT_MODEL). We self-host the ONNX and
    // worklet at /voice/ to defeat CDN failure (Pitfall 4).
    baseAssetPath: VAD_BASE_ASSET_PATH,
    // vad-web imports `onnxruntime-web/wasm` (a separate ORT instance from the
    // standalone `onnxruntime-web` import). ortConfig is vad-web's hook to
    // reach that internal instance so we can point it at our self-hosted
    // ort-wasm-*.{mjs,wasm} files instead of the default CDN/bundle path.
    ortConfig: (ort) => {
      ort.env.wasm.wasmPaths = VAD_BASE_ASSET_PATH;
    },
    onSpeechStart: () => {
      // Gate the clap detector against plosive consonants for the duration
      // of this speech segment. Cleared at the head of onSpeechEnd.
      vadSpeakingRef.current = true;
      const s = micStateRef.current;
      if (s === "listening") {
        // Three sub-cases now:
        //   1. In follow-up window (≤5s after JARVIS's last TTS_END): user
        //      is in active conversation — any speech is a command. Flip
        //      to "recording", glow the bubble, dispatch the transcript
        //      verbatim. No wake-word required.
        //   2. Passive listening WITH Porcupine: do nothing. On-device wake
        //      word will fire WAKE_WORD_DETECTED in a separate effect when
        //      it hears "Jarvis". No STT call, no log, true rest state.
        //   3. Passive listening WITHOUT Porcupine: Whisper-keyword fallback.
        //      Mark the source so onSpeechEnd runs STT + stripWakeWord. UI
        //      stays silent until a wake match is confirmed.
        const inFollowUp = followUpUntilRef.current > Date.now();
        if (inFollowUp) {
          activationSourceRef.current = "follow-up";
          window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));
          dispatch({ type: "SPEECH_START" }); // → recording
        } else if (!hasPorcupineWakeWord) {
          activationSourceRef.current = "wake-word";
        }
        // else: Porcupine handles wake — leave activationSource null and
        //       skip STT entirely in onSpeechEnd.
        return;
      }
      if (s === "recording") {
        // Already recording (press-to-talk / clap) — VAD detecting speech
        // here is normal, just keep the state. Clear the no-speech
        // auto-shutoff timer so a long utterance isn't cut off after 8s.
        if (noSpeechTimeoutRef.current) {
          clearTimeout(noSpeechTimeoutRef.current);
          noSpeechTimeoutRef.current = null;
        }
        dispatch({ type: "SPEECH_START" });
      }
      // Barge-in is disabled — talking over JARVIS while it speaks would
      // otherwise auto-transition to recording and process the interruption
      // as a new command. The follow-up window opened on TTS_END is the
      // supported way to chain commands.
      //
      // Other states (thinking, speaking, idle): VAD runs continuously since
      // startOnLoad=true, so this fires constantly. Ignore.
    },
    onSpeechEnd: async (audio: Float32Array) => {
      // Phase 9 / TEL-01 — vad_end_at boundary. Captured BEFORE any branch so
      // it fires for every voice-mode onSpeechEnd, including early returns.
      // NOT collectStage-d here: activeTurnId is not yet bound (binding
      // happens in onTurnStart, fired asynchronously after streamJarvis →
      // /api/jarvis emits its first SSE frame). Eager collectStage would
      // silently no-op and drop the timestamp on every turn. Pipe through
      // the jarvis-voice-transcript event detail; the consumer collectStage's
      // it inside onTurnStart, AFTER setActiveTurnId.
      const vadEndAt = Date.now();
      // Speech segment ended — release the clap-detector gate so a real
      // post-utterance clap (in silence) can fire normally.
      vadSpeakingRef.current = false;
      const s = micStateRef.current;
      // Two entry states are meaningful here:
      //   "recording" — explicit channel (press-to-talk, clap, follow-up).
      //                 We're already glowing; transition to thinking now.
      //   "listening" — passive listen. We deliberately stayed here on
      //                 speech-start so ambient noise doesn't light up the UI.
      //                 STT runs silently; only a wake-word match transitions
      //                 to thinking.
      if (s !== "recording" && s !== "listening") return;

      const source = activationSourceRef.current;
      activationSourceRef.current = null;

      // Rest-state bail: passive listening with no activation source =
      // ambient speech outside the follow-up window with Porcupine handling
      // the wake word on-device. Skip STT entirely — no log, no API call,
      // no UI change. This is the "completely off/idle" path the user
      // expects when no wake word is active and >5s have passed.
      if (s === "listening" && !source) {
        return;
      }

      const isPassiveListen = s === "listening" && source === "wake-word";
      const isFollowUp = source === "follow-up";
      const isPorcupineWake = source === "porcupine";

      // Explicit channels: flip to "thinking" now so the bubble keeps glowing
      // through the STT round-trip. Passive listen stays in "listening".
      if (s === "recording") {
        dispatch({ type: "SPEECH_END" });
      }

      sttAbortRef.current?.abort();
      const abort = new AbortController();
      sttAbortRef.current = abort;

      try {
        const wav = encodeWav(audio, 16000);
        const res = await fetch("/api/jarvis/stt", {
          method: "POST",
          body: wav,
          headers: { "Content-Type": "audio/wav" },
          signal: abort.signal,
        });

        if (!res.ok) throw new Error(`stt ${res.status}`);

        // Phase 9 / TEL-01: STT proxy returns x-jarvis-stt-done-at (epoch ms).
        // Forward it through jarvis-voice-transcript so the /api/jarvis caller
        // can attach it as X-Jarvis-Stt-Done-At on the next POST. Guard
        // NaN/missing — telemetry must never break the user flow.
        const sttDoneAtHeader = res.headers.get("x-jarvis-stt-done-at");
        const sttDoneAtMs = sttDoneAtHeader ? Number(sttDoneAtHeader) : null;
        const sttDoneAtSafe =
          sttDoneAtMs != null && Number.isFinite(sttDoneAtMs) ? sttDoneAtMs : null;

        const { transcript } = (await res.json()) as { transcript: string };

        let command = transcript;

        if (isPassiveListen) {
          // eslint-disable-next-line no-console
          console.log(
            "[jarvis] wake-path: passive-listen, transcript:",
            JSON.stringify(transcript),
          );
          const stripped = stripWakeWord(transcript);
          if (stripped === null) {
            // No wake phrase — ambient speech. No state change needed
            // (we're still in "listening"). Silent discard.
            return;
          }
          if (!stripped) {
            // Wake phrase with no command ("hey jarvis"). Pulse the bubble
            // and open the follow-up window so the next utterance is
            // dispatched as a command without re-saying the wake phrase.
            // Stay in "listening".
            window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));
            followUpUntilRef.current = Date.now() + FOLLOW_UP_MS;
            return;
          }
          // Wake-word matched with a command. Light the bubble + transition
          // to thinking now (we never left "listening" up to this point).
          window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));
          dispatch({ type: "SPEECH_END" }); // listening → thinking
          command = stripped;
        } else if (isFollowUp) {
          // eslint-disable-next-line no-console
          console.log(
            "[jarvis] wake-path: follow-up, transcript:",
            JSON.stringify(transcript),
          );
          // If the user habitually says "hey jarvis ..." inside the follow-
          // up window, strip everything up to and including the phrase so
          // the command portion is just what comes after.
          const afterWake = stripWakeWordAnywhere(transcript);
          const base = afterWake !== null ? afterWake : transcript;
          command = base
            .trim()
            .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
            .trim();
          if (!command) {
            // Empty follow-up — return to listening.
            dispatch({ type: "ERROR", reason: "empty-followup" });
            return;
          }
        } else if (isPorcupineWake) {
          // Porcupine flagged a candidate wake earlier, but the state stayed
          // in "listening" — no visual change yet. Cross-validate against
          // Whisper: only NOW (after STT confirms the user actually said
          // "hey jarvis") do we light the bubble and transition state.
          // Porcupine misfires leave the system completely silent.
          //
          // Use `stripWakeWordAnywhere` so any audio captured BEFORE the
          // wake-word (the user often rambles into the phrase) is also
          // discarded — only what comes after "hey jarvis" is the command.
          // eslint-disable-next-line no-console
          console.log(
            "[jarvis] wake-path: porcupine, transcript:",
            JSON.stringify(transcript),
          );
          const stripped = stripWakeWordAnywhere(transcript);
          if (stripped === null) {
            // Porcupine misfire (Whisper saw no wake phrase). The 4s
            // tentativelyActive timer started when Porcupine fired will
            // expire and the bubble fades naturally — silent discard
            // otherwise.
            return;
          }
          // Wake-burst was already dispatched when Porcupine fired; no
          // need to repeat it here.
          if (!stripped) {
            // Wake phrase alone — open follow-up window, stay in listening.
            followUpUntilRef.current = Date.now() + FOLLOW_UP_MS;
            return;
          }
          // Promote to thinking so the bubble keeps glowing through the
          // /api/jarvis round-trip (fsmActive=true once state=thinking).
          dispatch({ type: "SPEECH_END" });
          command = stripped;
        }
        // Press-to-talk / clap: transcript IS the command, no preprocessing.

        // Empty-STT gate (#315): Silero fired speech-start/-end (so this wasn't
        // pure silence), but STT came back empty/whitespace — a cough, a knock,
        // a mis-detected noise. Send NOTHING. Return to listening quietly; no
        // agent turn, no bubble. The wake/follow-up branches above already
        // guard their own empty results; this covers the direct channels.
        if (!command.trim()) {
          // eslint-disable-next-line no-console
          console.log("[jarvis] empty STT on direct channel — no turn sent");
          dispatch({ type: "ERROR", reason: "no-speech" });
          return;
        }

        window.dispatchEvent(
          new CustomEvent("jarvis-voice-transcript", {
            detail: {
              transcript: command,
              sttDoneAt: sttDoneAtSafe,
              // Phase 9 / TEL-01 — locally-captured VAD end timestamp
              // piped through for deferred collectStage in the consumer's
              // onTurnStart callback (after setActiveTurnId binds the turn).
              vadEndAt,
            },
          }),
        );

        dispatch({ type: "TRANSCRIPT_SENT" });
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === "AbortError") {
          // User cancelled mid-STT — silently return to listening.
          dispatch({ type: "ERROR", reason: "cancelled" });
          return;
        }
        console.error("[jarvis-listener] stt failed", err);
        // ERROR → listening (resilient — user can try again).
        dispatch({ type: "ERROR", reason: "stt" });
      } finally {
        if (sttAbortRef.current === abort) sttAbortRef.current = null;
      }
    },
  });

  // ─── Global cancel (jarvis-cancel) ───────────────────────────────────────
  // Fired by PressToTalkButton when the user taps the active stop button.
  // Aborts in-flight STT, stops TTS playback, closes the follow-up window,
  // and resets the FSM to listening. /api/jarvis abort is handled by the
  // submit owners (JarvisConsole / GlobalJarvisHandler) listening for the
  // same event.
  useEffect(() => {
    function handleCancel() {
      sttAbortRef.current?.abort();
      sttAbortRef.current = null;
      ttsPlayer.stop();
      followUpUntilRef.current = 0;
      // ERROR action returns to listening from any non-idle state.
      dispatch({ type: "ERROR", reason: "cancelled" });
    }
    window.addEventListener("jarvis-cancel", handleCancel);
    return () => window.removeEventListener("jarvis-cancel", handleCancel);
  }, [ttsPlayer]);

  // VAD runs continuously (startOnLoad=true) — gating happens in the
  // onSpeechStart/onSpeechEnd callbacks via micStateRef. No start/pause cycle
  // here: StrictMode's destroy/remount made vad.start() unreliable.
  useEffect(() => {
    if (vad.errored) {
      console.warn("[jarvis] vad errored:", vad.errored);
    }
  }, [vad.errored]);

  // ─── Clap-clap activation (VOICE-03) ─────────────────────────────────────
  // Clap is a listening trigger (same class as wake-word + press-to-talk),
  // so it runs whenever voice is enabled — including discreet mode.
  useClapDetector({
    enabled: listenActive && settings.clapEnabled && micState === "listening",
    audioContext: audioContextRef.current,
    stream: streamRef.current,
    onDoubleClap: () => {
      // Suppress if VAD is currently mid-speech — the worklet tripped on
      // plosive consonants ('t', 'p', 'k', 'b', 'd'), not actual claps.
      // Real claps happen in silence; this gate has no false negatives for
      // genuine clap activations. See vadSpeakingRef declaration for the
      // full debug-session rationale.
      if (vadSpeakingRef.current) {
        // eslint-disable-next-line no-console
        console.warn("[clap] suppressed: VAD currently detecting speech");
        return;
      }
      activationSourceRef.current = "clap";
      dispatch({ type: "DOUBLE_CLAP" });
    },
  });

  // ─── Cmd+Shift+J press-to-talk (VOICE-09) ────────────────────────────────
  // CRITICAL_PHASE7_CONCERNS #10: gated on pressToTalkActive (voiceEnabled only),
  // NOT on wakeWordActive — this fires EVEN in Discreet mode.
  const onPressToTalk = useCallback(() => {
    // Barge-in from the shortcut while JARVIS is working or talking: fire the
    // SAME interrupt as the stop button (jarvis-cancel) so playback halts, the
    // in-flight server turn is aborted (submit owners abort /api/jarvis), and
    // any mid-utterance STT is cancelled — THEN open a fresh mic below. This
    // makes "playback stops and the mic opens" a single keypress, matching the
    // desktop ⌘⌃J barge-in.
    const s = micStateRef.current;
    if (s === "thinking" || s === "speaking") {
      window.dispatchEvent(new CustomEvent("jarvis-cancel"));
    }
    // Same anticipatory burst as the wake-word path so the visual response
    // is identical regardless of activation channel.
    activationSourceRef.current = "press-to-talk";
    window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));
    dispatch({ type: "PRESS_TO_TALK" });
  }, []);

  usePressToTalk(pressToTalkActive, onPressToTalk);

  // Allow UI buttons (PressToTalkButton in header) to trigger the same
  // PRESS_TO_TALK transition via a custom event — keyboard shortcut is
  // unreliable in Safari and gets intercepted by some focus contexts.
  useEffect(() => {
    if (!pressToTalkActive) return;
    function handler() {
      onPressToTalk();
    }
    window.addEventListener("jarvis-press-to-talk", handler);
    return () => window.removeEventListener("jarvis-press-to-talk", handler);
  }, [pressToTalkActive, onPressToTalk]);

  // ─── TTS speak event listeners (Phase 10 Plan 10-04 — per-sentence wiring) ─
  // Phase 7's single per-turn voice-speak event (one fire per turn carrying
  // the accumulated text) is replaced by two events:
  //
  //   - 'jarvis-voice-speak-sentence' — fires PER sentence boundary as
  //     Anthropic text deltas stream. detail.seq is the monotonic sentence
  //     index within the turn (0, 1, 2, ...). Dispatched by JarvisConsole
  //     and GlobalJarvisHandler from inside their splitDeltas() consumer.
  //
  //   - 'jarvis-voice-end-of-turn' — fires on SSE close after the final
  //     sentence has been dispatched. Signals the controller to drain
  //     in-flight fetches and fire onEnd.
  //
  // Silent branches (locked AudioContext, discreetMode, ttsProvider='off')
  // must still cycle the FSM via TTS_START/TTS_END, but only ONCE per
  // turn — silentCycledRef guards against re-cycling on each sentence in
  // a multi-sentence silent turn. Reset on end-of-turn.

  // Track whether we have already cycled the silent-branch FSM for the
  // current turn so multi-sentence silent turns don't bounce the FSM N
  // times. Reset on jarvis-voice-end-of-turn.
  const silentCycledRef = useRef(false);

  useEffect(() => {
    function handleSentence(e: Event) {
      const detail = (
        e as CustomEvent<{
          text: string;
          seq: number;
          voiceId?: string;
          isVoice?: boolean;
        }>
      ).detail;
      if (!detail?.text?.trim()) return;
      // The 5s follow-up window opens only for voice turns. We don't open
      // it per-sentence — only on end-of-turn. Stash isVoice on a ref so
      // handleEndOfTurn can read it without coupling to the closure.
      turnIsVoiceRef.current = detail.isVoice === true;

      // Read the shared AudioContext lazily — modal unlock can happen
      // anytime; we need to pick it up on whichever sentence first finds it.
      const audioContext =
        audioContextRef.current ?? getSharedAudioContext();
      audioContextRef.current = audioContext;

      // Silent-branch cases: no AudioContext (Safari pre-gesture), discreet
      // mode (user muted), ttsProvider === 'off'. FSM must still cycle so
      // subsequent wake-word utterances aren't discarded — but only ONCE per
      // turn (not once per sentence).
      const silent =
        !audioContext ||
        settings.discreetMode ||
        settings.ttsProvider === "off";

      if (silent) {
        // One-shot "audio locked" toast on the first sentence of a turn
        // where the only barrier is the unlocked AudioContext.
        const audioLocked =
          !audioContext &&
          !settings.discreetMode &&
          settings.ttsProvider !== "off";
        if (audioLocked && !audioLockWarnedRef.current && detail.seq === 0) {
          audioLockWarnedRef.current = true;
          toast("JARVIS audio locked.", {
            description:
              "Browsers require a click before playing audio. Tap anywhere to unlock.",
            duration: 8000,
            action: {
              label: "Unlock",
              onClick: () => {
                void unlockAudioContext().catch(() => {});
              },
            },
          });
        }
        if (!silentCycledRef.current) {
          silentCycledRef.current = true;
          dispatch({ type: "TTS_START" });
          dispatch({ type: "TTS_END" });
          // Phase 9 / TEL-01 — silent-branch flush even when muted.
          flushNow();
        }
        return;
      }

      // ElevenLabs / browser-fallback path — controller handles fallback
      // policy internally per D-04.
      ttsPlayer.playSentence(detail.text, detail.seq, {
        voiceId: detail.voiceId ?? settings.voiceId,
        ttsProvider: settings.ttsProvider,
        audioContext,
        onStart: () => dispatch({ type: "TTS_START" }),
        onEnd: () => {
          // The controller fires onEnd once per turn (after all in-flight
          // fetches drain + AudioQueue empties + endOfTurn() was called).
          dispatch({ type: "TTS_END" });
          // Phase 9 / TEL-01 — flush any partial telemetry (idempotent).
          flushNow();
          if (turnIsVoiceRef.current) {
            followUpUntilRef.current = Date.now() + FOLLOW_UP_MS;
          }
        },
      });
    }

    window.addEventListener("jarvis-voice-speak-sentence", handleSentence);
    return () => {
      window.removeEventListener(
        "jarvis-voice-speak-sentence",
        handleSentence,
      );
    };
  // settings changes are intentionally included — discreetMode / ttsProvider
  // changes reflect on the next sentence dispatch. ttsPlayer is stable
  // (useCallback refs internally).
  }, [settings.discreetMode, settings.ttsProvider, settings.voiceId, ttsPlayer]);

  useEffect(() => {
    function handleEndOfTurn(e: Event) {
      const detail = (
        e as CustomEvent<{ isVoice?: boolean }>
      ).detail;
      // Honor isVoice from the end-of-turn event in case no sentence ever
      // fired (e.g., the model emitted only a tool call and the butler-ack
      // fallback path was never triggered — defensive).
      if (typeof detail?.isVoice === "boolean") {
        turnIsVoiceRef.current = detail.isVoice;
      }

      // Silent-branch turns already cycled the FSM in handleSentence; just
      // close the follow-up window check and reset the per-turn flag so the
      // NEXT turn starts clean.
      if (silentCycledRef.current) {
        silentCycledRef.current = false;
        if (turnIsVoiceRef.current) {
          followUpUntilRef.current = Date.now() + FOLLOW_UP_MS;
        }
        return;
      }

      // ElevenLabs / browser-fallback path — controller will fire its onEnd
      // (which lands in handleSentence's onEnd closure) once all in-flight
      // fetches drain + AudioQueue empties.
      ttsPlayer.endOfTurn();
    }

    window.addEventListener("jarvis-voice-end-of-turn", handleEndOfTurn);
    return () => {
      window.removeEventListener("jarvis-voice-end-of-turn", handleEndOfTurn);
    };
  }, [ttsPlayer]);

  // JarvisListener renders nothing — it is a pure lifecycle owner.
  return null;
}
