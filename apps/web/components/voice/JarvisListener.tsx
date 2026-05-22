"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useCallback,
} from "react";
import { usePorcupine } from "@picovoice/porcupine-react";
import { useMicVAD } from "@ricky0123/vad-react";
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
import { stripWakeWord } from "@/lib/voice/wake-word";
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

  // Publish FSM state changes so MicIndicatorDot (separate tree) stays in sync.
  useEffect(() => {
    micStateRef.current = micState;
    publishMicState(micState);
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

  // Dispatch WAKE_WORD_DETECTED when Porcupine fires a keyword.
  useEffect(() => {
    if (!porcupine.keywordDetection) return;
    if (micState !== "listening") return;
    dispatch({ type: "WAKE_WORD_DETECTED" });
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
      const s = micStateRef.current;
      // Barge-in is disabled — talking over JARVIS while it speaks would
      // otherwise auto-transition to recording and process the interruption
      // as a new command, capturing things like "yes it works" that were
      // meant as side comments, not commands. The 5-second follow-up window
      // opened on TTS_END is the supported way to chain commands without
      // saying "Hey Jarvis" each time.
      if (s === "recording") {
        // Already recording — VAD detecting speech during recording is normal; no-op.
        dispatch({ type: "SPEECH_START" });
      }
      // Other states (listening, thinking, speaking, idle): VAD runs continuously since
      // startOnLoad=true, so this fires constantly. Ignore unless explicitly
      // armed via wake-word, clap, or press-to-talk.
    },
    onSpeechEnd: async (audio: Float32Array) => {
      const s = micStateRef.current;
      // eslint-disable-next-line no-console
      console.log("[jarvis] onSpeechEnd state:", s, "samples:", audio.length);
      // Two entry paths:
      //   - "recording" — user explicitly armed via press-to-talk / clap.
      //     Transcript IS the command. Transition to thinking immediately.
      //   - "listening" — wake-word path. Transcribe everything, only treat
      //     as a command if it starts with "hey jarvis" (stripWakeWord).
      //     This is the always-on listening loop.
      // Other states (thinking, speaking, idle): discard.
      if (s !== "recording" && s !== "listening") return;

      const isWakeWordPath = s === "listening";

      // Press-to-talk path: move to thinking now so the dot reflects the
      // pipeline state during the STT round-trip. Wake-word path stays in
      // listening until we confirm the wake phrase matched.
      if (!isWakeWordPath) dispatch({ type: "SPEECH_END" });

      try {
        const wav = encodeWav(audio, 16000);
        const res = await fetch("/api/jarvis/stt", {
          method: "POST",
          body: wav,
          headers: { "Content-Type": "audio/wav" },
        });

        if (!res.ok) throw new Error(`stt ${res.status}`);

        const { transcript } = (await res.json()) as { transcript: string };
        // eslint-disable-next-line no-console
        console.log("[jarvis] STT transcript:", JSON.stringify(transcript), "wake-path:", isWakeWordPath);

        let command = transcript;
        if (isWakeWordPath) {
          const inFollowUp = followUpUntilRef.current > Date.now();
          if (inFollowUp) {
            // 5-second window after the last response: any utterance counts
            // as a follow-up command, no wake phrase required.
            command = transcript
              .trim()
              .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
              .trim();
            if (!command) return;
            // eslint-disable-next-line no-console
            console.log("[jarvis] follow-up window — captured:", command);
          } else {
            const stripped = stripWakeWord(transcript);
            // eslint-disable-next-line no-console
            console.log("[jarvis] wake-word strip result:", stripped === null ? "NO MATCH" : `"${stripped}"`);
            if (stripped === null) {
              // No wake phrase — silently discard, stay in listening.
              return;
            }
            if (!stripped) {
              // Wake phrase alone with no command ("hey jarvis"). Discard
              // for now; could later acknowledge with "Yes, sir?".
              return;
            }
            command = stripped;
          }
          dispatch({ type: "SPEECH_END" }); // listening → thinking now
        }

        window.dispatchEvent(
          new CustomEvent("jarvis-voice-transcript", { detail: { transcript: command } }),
        );

        dispatch({ type: "TRANSCRIPT_SENT" });
      } catch (err) {
        console.error("[jarvis-listener] stt failed", err);
        // ERROR → listening (resilient — user can try again).
        dispatch({ type: "ERROR", reason: "stt" });
      }
    },
  });

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
    onDoubleClap: () => dispatch({ type: "DOUBLE_CLAP" }),
  });

  // ─── Cmd+Shift+J press-to-talk (VOICE-09) ────────────────────────────────
  // CRITICAL_PHASE7_CONCERNS #10: gated on pressToTalkActive (voiceEnabled only),
  // NOT on wakeWordActive — this fires EVEN in Discreet mode.
  const onPressToTalk = useCallback(() => {
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

  // ─── TTS speak event listener (Phase 7 Plan 07-04) ───────────────────────
  // JarvisConsole dispatches 'jarvis-voice-speak' when an action receipt with
  // voice_summary arrives. We play it back via useTtsPlayer, dispatching
  // TTS_START (→ speaking state) and TTS_END (→ listening state) to the FSM.
  //
  // Discreet mode gate (VOICE-07): when discreetMode is on, TTS provider is
  // effectively 'off' — we instantly cycle TTS_START/TTS_END so the FSM
  // transitions correctly but no audio plays.
  useEffect(() => {
    function handleVoiceSpeak(e: Event) {
      const detail = (e as CustomEvent<{ text: string; voiceId?: string }>).detail;
      if (!detail?.text?.trim()) return;

      // Read the shared AudioContext lazily on every event so we pick it up
      // even if it was unlocked AFTER this effect mounted (modal unlock
      // happens before the user navigates to /today, but PressToTalkButton
      // unlock can happen anytime).
      const audioContext =
        audioContextRef.current ?? getSharedAudioContext();
      audioContextRef.current = audioContext;

      // FSM MUST cycle regardless of whether we can actually play audio.
      // If we bail early, the listener stays in "thinking" forever and
      // subsequent wake-word utterances get discarded. The three silent
      // cases:
      //   1. No AudioContext yet (Safari needs a user gesture to unlock)
      //   2. Discreet mode (user muted TTS)
      //   3. ttsProvider === 'off'
      const silent =
        !audioContext ||
        settings.discreetMode ||
        settings.ttsProvider === "off";

      if (silent) {
        dispatch({ type: "TTS_START" });
        dispatch({ type: "TTS_END" });
        followUpUntilRef.current = Date.now() + FOLLOW_UP_MS;
        return;
      }

      void ttsPlayer.play({
        text: detail.text,
        voiceId: detail.voiceId ?? settings.voiceId,
        ttsProvider: settings.ttsProvider,
        audioContext,
        onStart: () => dispatch({ type: "TTS_START" }),
        onEnd: () => {
          dispatch({ type: "TTS_END" });
          followUpUntilRef.current = Date.now() + FOLLOW_UP_MS;
        },
      });
    }

    window.addEventListener("jarvis-voice-speak", handleVoiceSpeak);
    return () => {
      window.removeEventListener("jarvis-voice-speak", handleVoiceSpeak);
    };
  // settings changes are intentionally included — discreetMode / ttsProvider
  // changes should be reflected immediately on the next speak event.
  // ttsPlayer is stable (useCallback refs in useTtsPlayer).
  }, [settings.discreetMode, settings.ttsProvider, settings.voiceId, ttsPlayer]);

  // JarvisListener renders nothing — it is a pure lifecycle owner.
  return null;
}
