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

// ─── Module-level singleton pub-sub ────────────────────────────────────────
// Single subscriber (MicIndicatorDot in header). Keeps FSM state visible to
// a sibling component tree without a Context provider or global store.
let currentMicState: MicState = "idle";
const stateSubscribers = new Set<(s: MicState) => void>();

export function subscribeToMicState(fn: (s: MicState) => void): () => void {
  stateSubscribers.add(fn);
  // Immediately notify with current state so subscriber doesn't wait.
  fn(currentMicState);
  return () => stateSubscribers.delete(fn);
}

function publishMicState(s: MicState) {
  currentMicState = s;
  stateSubscribers.forEach((fn) => fn(s));
}
// ───────────────────────────────────────────────────────────────────────────

export function JarvisListener() {
  const { settings, mounted } = useVoiceSettings();
  const [micState, dispatch] = useReducer(micReducer, "idle");
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Publish FSM state changes so MicIndicatorDot (separate tree) stays in sync.
  useEffect(() => {
    publishMicState(micState);
  }, [micState]);

  // ─── Gate computations ───────────────────────────────────────────────────
  // wakeWordActive: voice must be on AND not in discreet mode (Porcupine gated).
  // pressToTalkActive: voice on only — NOT gated on discreet (CRITICAL #10).
  const wakeWordActive = mounted && settings.voiceEnabled && !settings.discreetMode;
  const pressToTalkActive = mounted && settings.voiceEnabled;

  // ─── Voice enabled/disabled FSM transition ───────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    if (settings.voiceEnabled && !settings.discreetMode) {
      dispatch({ type: "VOICE_ENABLED" });
    } else {
      dispatch({ type: "VOICE_DISABLED" });
    }
  }, [mounted, settings.voiceEnabled, settings.discreetMode]);

  // ─── Mic stream acquisition ───────────────────────────────────────────────
  // Acquire (and hold) the mic stream whenever wake-word mode is active.
  useEffect(() => {
    if (!wakeWordActive) return;

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

        // AudioContext was unlocked by the EnableVoiceModal click handler in
        // Plan 07-02 (autoplay policy satisfied). Re-create here for ownership
        // clarity; the user-gesture lock is already satisfied for this origin.
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
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
  }, [wakeWordActive, settings.micDeviceId]);

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
    startOnLoad: false,
    // baseAssetPath: library constructs URL as baseAssetPath + "silero_vad_v5.onnx"
    // (for model='v5' default). We self-host the ONNX at /voice/silero_vad_v5.onnx
    // to defeat CDN failure (Pitfall 4 — @ricky0123/vad-web v0.0.36 API).
    baseAssetPath: VAD_BASE_ASSET_PATH,
    onSpeechStart: () => {
      // Barge-in (VOICE-12): if JARVIS is speaking, interrupt and re-enter recording.
      if (micState === "speaking" || micState === "recording") {
        dispatch({ type: "SPEECH_START" });
      }
    },
    onSpeechEnd: async (audio: Float32Array) => {
      dispatch({ type: "SPEECH_END" });

      // POST to /api/jarvis/stt; result forwarded to Plan 04 via custom event.
      // Plan 03 dispatches the event; Plan 04 listens and pipes into the JARVIS Console.
      try {
        const wav = encodeWav(audio, 16000);
        const res = await fetch("/api/jarvis/stt", {
          method: "POST",
          body: wav,
          headers: { "Content-Type": "audio/wav" },
        });

        if (!res.ok) {
          throw new Error(`stt ${res.status}`);
        }

        const { transcript } = (await res.json()) as { transcript: string };

        // Plan 04 listens for this event to pipe the transcript into the JARVIS Console.
        window.dispatchEvent(
          new CustomEvent("jarvis-voice-transcript", { detail: { transcript } }),
        );

        dispatch({ type: "TRANSCRIPT_SENT" });
      } catch (err) {
        console.error("[jarvis-listener] stt failed", err);
        dispatch({ type: "ERROR", reason: "stt" });
      }
    },
  });

  // Arm VAD during recording and speaking (barge-in detection); pause otherwise.
  useEffect(() => {
    if (micState === "recording" || micState === "speaking") {
      vad.start();
    } else {
      vad.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micState]);

  // ─── Clap-clap activation (VOICE-03) ─────────────────────────────────────
  useClapDetector({
    enabled: wakeWordActive && settings.clapEnabled && micState === "listening",
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

  // JarvisListener renders nothing — it is a pure lifecycle owner.
  return null;
}
