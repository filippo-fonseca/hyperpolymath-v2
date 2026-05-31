"use client";

import { useEffect, useRef } from "react";

import { AUDIO_CONSTRAINTS } from "@/lib/voice/constants";
import { encodeWav } from "@/lib/voice/encode-wav";
import { getSharedAudioContext, unlockAudioContext } from "@/lib/voice/audio-context";
import { useTtsPlayer } from "@/lib/voice/use-tts-player";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";

const HARD_CAP_MS = 10_000;
const WAIT_FOR_SPEECH_MS = 5_000;
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
  const { settings } = useVoiceSettings();
  const ttsPlayer = useTtsPlayer();

  // First-gesture audio unlock — mirrors Phase 7's pattern. Browsers
  // require a user-gesture AudioContext.resume() before any decoded audio
  // will play. Without this, ttsPlayer.playSentence runs silently.
  useEffect(() => {
    if (!settings.voiceEnabled) return;
    if (getSharedAudioContext()) return;

    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      void unlockAudioContext().catch(() => {});
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [settings.voiceEnabled]);

  // TTS playback — subscribes to the same jarvis-voice-speak-sentence /
  // jarvis-voice-end-of-turn events that JarvisListener consumes when PE
  // mode is OFF. Mirrors JarvisListener's TTS handler but stripped of FSM
  // dispatch (no mic state machine here) and follow-up-window logic.
  useEffect(() => {
    const handleSentence = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          text: string;
          seq: number;
          voiceId?: string;
        }>
      ).detail;
      if (!detail?.text?.trim()) return;

      const audioContext = getSharedAudioContext();

      const silent =
        !audioContext ||
        settings.discreetMode ||
        settings.ttsProvider === "off";
      if (silent) return;

      ttsPlayer.playSentence(detail.text, detail.seq, {
        voiceId: detail.voiceId ?? settings.voiceId,
        ttsProvider: settings.ttsProvider,
        audioContext,
        onStart: () => {
          // No FSM in PE mode — nothing to dispatch.
        },
        onEnd: () => {
          // Follow-up window — fire a synthetic wake-fire so the recorder
          // re-acquires the mic and waits up to WAIT_FOR_SPEECH_MS for the
          // user's next command. Matches the 5s follow-up the JarvisListener
          // path opens via followUpUntilRef.
          //
          // Deferred so we never dispatch inside a TTS callback that may
          // still be inside a React commit phase.
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("jarvis-wake-fire", {
                detail: { followUp: true },
              }),
            );
          }, 0);
        },
      });
    };

    window.addEventListener("jarvis-voice-speak-sentence", handleSentence);
    return () =>
      window.removeEventListener("jarvis-voice-speak-sentence", handleSentence);
  }, [settings.discreetMode, settings.ttsProvider, settings.voiceId, ttsPlayer]);

  useEffect(() => {
    let activeCleanup: (() => void) | null = null;

    const handleWakeFire = async (e: Event) => {
      const isFollowUp =
        (e as CustomEvent<{ followUp?: boolean }>).detail?.followUp === true;

      if (recordingRef.current) {
        // eslint-disable-next-line no-console
        console.log("[physical-extension-recorder] already recording — ignoring re-trigger");
        return;
      }
      recordingRef.current = true;

      // Wake-burst is the user-visible "I'm listening" flash. Fire it on
      // Arduino-originated wake-fires but skip on follow-ups so the bubble
      // doesn't flash twice for a single conversational exchange.
      if (!isFollowUp) {
        window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));
      }

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
        let hasSpoken = false;

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

            // Defer to a fresh task. Otherwise the synchronous fan-out
            // through JarvisConsole's transcript handler can land inside
            // a React commit phase and trigger the "Cannot update a
            // component while rendering" warning when the downstream
            // server action calls dispatchAppRouterAction.
            const vadEndAt = Date.now();
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent("jarvis-voice-transcript", {
                  detail: {
                    transcript: command,
                    sttDoneAt,
                    vadEndAt,
                  },
                }),
              );
            }, 0);
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

          if (rms >= SILENCE_THRESHOLD) {
            hasSpoken = true;
            silenceStart = null;
          } else if (hasSpoken) {
            // Speech-then-silence: normal end-of-speech detection.
            if (silenceStart === null) {
              silenceStart = now;
            } else if (now - silenceStart > SILENCE_DURATION_MS) {
              // eslint-disable-next-line no-console
              console.log(
                "[physical-extension-recorder] end-of-speech detected — stopping",
              );
              void finishAndProcess();
              return;
            }
          } else if (elapsed > WAIT_FOR_SPEECH_MS) {
            // Waited the full window without the user starting to speak —
            // release the mic. For Arduino fires this is rare (you usually
            // fire right when you're about to speak); for follow-ups this
            // is the natural close of the 5-second window.
            // eslint-disable-next-line no-console
            console.log(
              `[physical-extension-recorder] no speech within ${WAIT_FOR_SPEECH_MS}ms — releasing`,
            );
            void finishAndProcess();
            return;
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
