"use client";

import { useEffect, useRef } from "react";

import { AUDIO_CONSTRAINTS } from "@/lib/voice/constants";
import { encodeWav } from "@/lib/voice/encode-wav";

const HARD_CAP_MS = 8_000;
const MIN_RECORDING_MS = 1_500;
const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 1_000;
const POLL_INTERVAL_MS = 80;
const STT_SAMPLE_RATE = 16_000;

/**
 * Physical Extension mode listener — replaces JarvisListener when the
 * Physical Extension Mode toggle is ON.
 *
 * Uses raw Web Audio APIs (NOT vad-react) so mic acquisition is truly
 * event-driven. vad-react's hook lifecycle doesn't survive React
 * StrictMode's destroy/remount cycle with startOnLoad:false — the
 * "MicVAD has null stream" error.
 *
 * Lifecycle:
 *   1. Component mounts — nothing happens. No mic, no audio context, no
 *      browser tab mic indicator.
 *   2. Arduino fires wake-word → SSE arrives → jarvis-wake-fire event.
 *   3. Handler:
 *        a. getUserMedia → mic acquires NOW.
 *        b. Wire MediaStreamSource → AnalyserNode for silence detection
 *           AND MediaRecorder for audio capture.
 *        c. Poll RMS every 80ms. After MIN_RECORDING_MS (1.5s) of grace
 *           period, if RMS stays below threshold for SILENCE_DURATION_MS
 *           (1s), stop. Or hit the HARD_CAP_MS (8s) ceiling.
 *   4. Stop:
 *        a. recorder.stop() → assemble blob.
 *        b. stream.getTracks().forEach(t => t.stop()) → mic releases,
 *           tab mic indicator goes off.
 *        c. Decode the captured webm/opus blob → PCM Float32Array →
 *           resample to 16kHz → encode WAV → POST to /api/jarvis/stt.
 *        d. Dispatch jarvis-voice-transcript with the transcript so
 *           GlobalJarvisHandler / JarvisConsole runs the JARVIS turn.
 *   5. Back to step 1. Mic OFF until next wake-fire.
 */
export function PhysicalExtensionRecorder() {
  const recordingRef = useRef<boolean>(false);

  useEffect(() => {
    let activeCleanup: (() => void) | null = null;

    const handleWakeFire = async () => {
      if (recordingRef.current) {
        // eslint-disable-next-line no-console
        console.log("[physical-extension-recorder] already recording — ignoring re-trigger");
        return;
      }
      recordingRef.current = true;

      window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));

      let stream: MediaStream | null = null;
      let audioCtx: AudioContext | null = null;
      let recorder: MediaRecorder | null = null;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;

      const cleanup = () => {
        stopped = true;
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
        }
        if (audioCtx && audioCtx.state !== "closed") {
          audioCtx.close().catch(() => {});
          audioCtx = null;
        }
        recordingRef.current = false;
        activeCleanup = null;
      };

      activeCleanup = cleanup;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
        });

        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const sampleBuffer = new Float32Array(analyser.fftSize);

        recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        const startTime = Date.now();
        let silenceStart: number | null = null;

        const finishAndProcess = async () => {
          if (stopped) return;
          stopped = true;
          if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
          }

          const recorderStopPromise = new Promise<void>((resolve) => {
            if (!recorder) return resolve();
            recorder.addEventListener("stop", () => resolve(), { once: true });
          });
          try {
            recorder?.stop();
          } catch {
            // already stopped
          }
          await recorderStopPromise;

          // Release the mic — tab indicator goes off NOW.
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;

          try {
            if (chunks.length === 0) {
              // eslint-disable-next-line no-console
              console.log("[physical-extension-recorder] no audio captured");
              return;
            }

            const blob = new Blob(chunks);
            const arrayBuffer = await blob.arrayBuffer();

            // Decode the captured codec (typically webm/opus) -> PCM
            const decodeCtx = new AudioContext();
            const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
            await decodeCtx.close();

            const sourcePcm = audioBuffer.getChannelData(0);
            const pcm =
              audioBuffer.sampleRate === STT_SAMPLE_RATE
                ? sourcePcm
                : resamplePCM(
                    sourcePcm,
                    audioBuffer.sampleRate,
                    STT_SAMPLE_RATE,
                  );

            const wav = encodeWav(pcm, STT_SAMPLE_RATE);
            const res = await fetch("/api/jarvis/stt", {
              method: "POST",
              body: wav,
              headers: { "Content-Type": "audio/wav" },
            });

            if (!res.ok) {
              // eslint-disable-next-line no-console
              console.error(
                `[physical-extension-recorder] stt failed: ${res.status}`,
              );
              return;
            }

            const sttDoneAtHeader = res.headers.get("x-jarvis-stt-done-at");
            const sttDoneAtMs = sttDoneAtHeader
              ? Number(sttDoneAtHeader)
              : Date.now();
            const sttDoneAt =
              sttDoneAtMs != null && Number.isFinite(sttDoneAtMs)
                ? sttDoneAtMs
                : Date.now();

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

            window.dispatchEvent(
              new CustomEvent("jarvis-voice-transcript", {
                detail: {
                  transcript: command,
                  sttDoneAt,
                  vadEndAt: Date.now(),
                },
              }),
            );
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[physical-extension-recorder] processing error", err);
          } finally {
            if (audioCtx && audioCtx.state !== "closed") {
              audioCtx.close().catch(() => {});
              audioCtx = null;
            }
            recordingRef.current = false;
            activeCleanup = null;
          }
        };

        const pollSilence = () => {
          if (stopped) return;

          analyser.getFloatTimeDomainData(sampleBuffer);
          let sumSquares = 0;
          for (let i = 0; i < sampleBuffer.length; i++) {
            const v = sampleBuffer[i];
            sumSquares += v * v;
          }
          const rms = Math.sqrt(sumSquares / sampleBuffer.length);

          const now = Date.now();
          const elapsed = now - startTime;

          if (elapsed >= HARD_CAP_MS) {
            // eslint-disable-next-line no-console
            console.log(
              `[physical-extension-recorder] hard-cap ${HARD_CAP_MS}ms reached`,
            );
            void finishAndProcess();
            return;
          }

          // Only allow silence-based stop after the grace period — gives
          // the user time to actually start talking after the wake-fire.
          if (elapsed > MIN_RECORDING_MS) {
            if (rms < SILENCE_THRESHOLD) {
              if (silenceStart === null) {
                silenceStart = now;
              } else if (now - silenceStart > SILENCE_DURATION_MS) {
                // eslint-disable-next-line no-console
                console.log(
                  "[physical-extension-recorder] silence detected — stopping",
                );
                void finishAndProcess();
                return;
              }
            } else {
              silenceStart = null;
            }
          }

          pollTimer = setTimeout(pollSilence, POLL_INTERVAL_MS);
        };

        recorder.start();
        pollTimer = setTimeout(pollSilence, POLL_INTERVAL_MS);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[physical-extension-recorder] mic acquisition error", err);
        cleanup();
      }
    };

    window.addEventListener("jarvis-wake-fire", handleWakeFire);
    return () => {
      window.removeEventListener("jarvis-wake-fire", handleWakeFire);
      if (activeCleanup) activeCleanup();
    };
  }, []);

  return null;
}

/**
 * Linear-interpolation resample. Good enough for speech STT; Whisper
 * tolerates the mild artifacts. For high-fidelity audio you'd want a
 * proper polyphase filter.
 */
function resamplePCM(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio;
    const srcIdxFloor = Math.floor(srcIdx);
    const srcIdxCeil = Math.min(srcIdxFloor + 1, input.length - 1);
    const frac = srcIdx - srcIdxFloor;
    output[i] = input[srcIdxFloor] * (1 - frac) + input[srcIdxCeil] * frac;
  }
  return output;
}
