"use client";

import { useEffect, useRef } from "react";
import { useMicVAD } from "@ricky0123/vad-react";

import { VAD_BASE_ASSET_PATH } from "@/lib/voice/constants";
import { encodeWav } from "@/lib/voice/encode-wav";

const RECORDING_HARD_CAP_MS = 15_000;

/**
 * Physical Extension mode listener — replaces JarvisListener when the
 * Physical Extension Mode toggle is ON.
 *
 * Lifecycle (event-driven, no ambient listening):
 *   1. Component mounts → VAD model loads but mic is NOT yet acquired
 *      (startOnLoad: false).
 *   2. Arduino fires its wake-word → POST hits /api/jarvis/physical/trigger
 *      → SSE fans out to the browser → window dispatches "jarvis-wake-fire".
 *   3. Handler runs vad.start() — VAD acquires the laptop mic NOW.
 *      Visual burst fires for feedback.
 *   4. User speaks their command. VAD detects end-of-speech and calls
 *      onSpeechEnd with the captured Float32Array audio.
 *   5. Handler: vad.pause() to release the mic. Encode WAV. POST to
 *      /api/jarvis/stt. Dispatch jarvis-voice-transcript with the
 *      transcript — GlobalJarvisHandler (or JarvisConsole on /today)
 *      picks it up and runs the existing JARVIS → TTS pipeline.
 *   6. Mic is OFF again until the next Arduino wake-fire.
 *
 * Safety net: a 15-second hard-cap timer terminates a stuck recording so
 * the mic doesn't stay open forever if VAD never sees end-of-speech.
 */
export function PhysicalExtensionRecorder() {
  const recordingRef = useRef<boolean>(false);
  const hardCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vad = useMicVAD({
    startOnLoad: false,
    baseAssetPath: VAD_BASE_ASSET_PATH,
    ortConfig: (ort) => {
      ort.env.wasm.wasmPaths = VAD_BASE_ASSET_PATH;
    },
    onSpeechEnd: async (audio: Float32Array) => {
      if (!recordingRef.current) return;
      recordingRef.current = false;

      if (hardCapTimerRef.current) {
        clearTimeout(hardCapTimerRef.current);
        hardCapTimerRef.current = null;
      }

      // Release the mic immediately — we have the audio buffer.
      try {
        vad.pause();
      } catch {
        // ignore
      }

      const vadEndAt = Date.now();

      try {
        const wav = encodeWav(audio, 16000);
        const res = await fetch("/api/jarvis/stt", {
          method: "POST",
          body: wav,
          headers: { "Content-Type": "audio/wav" },
        });

        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.error(`[physical-extension-recorder] stt failed: ${res.status}`);
          return;
        }

        const sttDoneAtHeader = res.headers.get("x-jarvis-stt-done-at");
        const sttDoneAtMs = sttDoneAtHeader ? Number(sttDoneAtHeader) : null;
        const sttDoneAtSafe =
          sttDoneAtMs != null && Number.isFinite(sttDoneAtMs) ? sttDoneAtMs : null;

        const { transcript } = (await res.json()) as { transcript: string };
        const command = transcript?.trim() ?? "";

        if (!command) {
          // eslint-disable-next-line no-console
          console.log("[physical-extension-recorder] empty transcript — silent drop");
          return;
        }

        // eslint-disable-next-line no-console
        console.log(
          "[physical-extension-recorder] command:",
          JSON.stringify(command),
        );

        // Hand off to the existing pipeline. JarvisConsole on /today AND
        // GlobalJarvisHandler everywhere else listen for this event and
        // run the JARVIS turn + TTS.
        window.dispatchEvent(
          new CustomEvent("jarvis-voice-transcript", {
            detail: {
              transcript: command,
              sttDoneAt: sttDoneAtSafe,
              vadEndAt,
            },
          }),
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[physical-extension-recorder] stt error", err);
      }
    },
  });

  useEffect(() => {
    const handleWakeFire = () => {
      if (recordingRef.current) {
        // eslint-disable-next-line no-console
        console.log("[physical-extension-recorder] already recording — ignoring re-trigger");
        return;
      }
      recordingRef.current = true;

      try {
        vad.start();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[physical-extension-recorder] vad.start failed", err);
        recordingRef.current = false;
        return;
      }

      // Visual feedback — flashes the mic bubble briefly even though we
      // never enter the formal "recording" FSM state.
      window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));

      if (hardCapTimerRef.current) clearTimeout(hardCapTimerRef.current);
      hardCapTimerRef.current = setTimeout(() => {
        if (!recordingRef.current) return;
        // eslint-disable-next-line no-console
        console.warn(
          `[physical-extension-recorder] hard-cap ${RECORDING_HARD_CAP_MS}ms reached — releasing mic`,
        );
        recordingRef.current = false;
        try {
          vad.pause();
        } catch {
          // ignore
        }
        hardCapTimerRef.current = null;
      }, RECORDING_HARD_CAP_MS);
    };

    window.addEventListener("jarvis-wake-fire", handleWakeFire);
    return () => {
      window.removeEventListener("jarvis-wake-fire", handleWakeFire);
      if (hardCapTimerRef.current) {
        clearTimeout(hardCapTimerRef.current);
        hardCapTimerRef.current = null;
      }
    };
  }, [vad]);

  return null;
}
