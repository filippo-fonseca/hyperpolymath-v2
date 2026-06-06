// apps/desktop/src/audio/capture.ts
// Orchestrates a single capture turn:
//   1. POST claim (belt-and-braces alongside the persistent 10s heartbeat in main.ts)
//   2. Register audio-chunk event listener
//   3. invoke("start_capture") → Rust opens cpal stream
//   4. Feed chunks to VadSilenceDetector
//   5. On VAD end-of-speech: stop capture, encode WAV, POST to /voice/transcript

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { postClaim, postTranscript } from "@/api/client";
import { encodeWav } from "@/audio/encode-wav";
import { VadSilenceDetector } from "@/audio/vad";

interface AudioChunkPayload {
  samples: number[];
  sample_rate: number;
}

// Module-level guard: only one active capture turn at a time.
let activeUnlisten: UnlistenFn | null = null;

/**
 * Start a capture turn. Idempotent — calling while a turn is active is a no-op.
 * Called by the SSE subscriber on every `trigger` event.
 */
export async function startCaptureTurn(): Promise<void> {
  if (activeUnlisten) {
    // Already recording — ignore re-trigger (matches PhysicalExtensionRecorder guard).
    // eslint-disable-next-line no-console
    console.log("[capture] already recording — ignoring re-trigger");
    return;
  }

  // Refresh source claim immediately on wake — belt-and-braces alongside the
  // persistent 10s background heartbeat in main.ts (Plan 14-04). The persistent
  // heartbeat covers idle + active states; this extra immediate POST guarantees
  // a fresh claim is on file the instant we open the mic.
  await postClaim();

  const vad = new VadSilenceDetector();
  vad.start();

  let finished = false;

  // Register the audio-chunk listener BEFORE invoking start_capture to avoid
  // a race where the first chunks arrive before the listener is attached.
  activeUnlisten = await listen<AudioChunkPayload>("audio-chunk", (event) => {
    if (finished) return;
    const chunk = new Float32Array(event.payload.samples);
    const ended = vad.push(chunk);
    if (ended) {
      finished = true;
      void finishTurn(vad);
    }
  });

  await invoke("start_capture");
}

/** Capture `vadEndAt` BEFORE awaiting stop so the timestamp reflects the
 *  moment VAD declared silence end (matches PhysicalExtensionRecorder pattern). */
async function finishTurn(vad: VadSilenceDetector): Promise<void> {
  const vadEndAt = Date.now();
  await stopCaptureTurn();
  const samples = vad.flush();
  if (samples.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[capture] no audio captured — silent drop");
    return;
  }
  const wav = encodeWav(samples, 16_000);
  const result = await postTranscript({ wav, vadEndAt });
  if (result) {
    // eslint-disable-next-line no-console
    console.log(
      `[capture] transcript received (sttDoneAt=${result.sttDoneAt}): ${result.transcript.slice(0, 80)}`,
    );
  }
}

/**
 * Stop the active capture turn.
 * Unregisters the audio-chunk listener and tells Rust to close the cpal stream.
 */
export async function stopCaptureTurn(): Promise<void> {
  if (activeUnlisten) {
    activeUnlisten();
    activeUnlisten = null;
  }
  await invoke("stop_capture");
}
