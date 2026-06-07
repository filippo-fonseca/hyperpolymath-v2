/**
 * Phase 12 — wake-word worker message protocol + main-thread handle.
 *
 * Contracts only — no runtime code. Consumed by:
 *   - apps/web/lib/voice/wake-word-client.ts (main-thread spawner)
 *   - apps/web/public/workers/wake-word.worker.js (worker — types are JSDoc'd, not imported)
 *   - apps/web/components/voice/JarvisListener.tsx (Plan 12-02 consumer)
 */

/** Main → Worker. Frames flow at ~12.5/sec (80ms cadence). */
export type WakeWordClientMessage =
  | { type: "init" }
  | { type: "frame"; pcm: Float32Array }
  | { type: "pause" }
  | { type: "resume" };

/** Worker → Main. */
export type WakeWordWorkerMessage =
  | { type: "ready" }
  | { type: "progress"; msg: string }
  | { type: "wake"; score: number }
  | {
      type: "shapes";
      mel: readonly number[];
      emb: readonly number[];
      cls: readonly number[];
    }
  | { type: "error"; error: string };

/** Returned by spawnWakeWordWorker() to the main thread. */
export interface WakeWordHandle {
  readonly worker: Worker;
  /** Main-thread mirror of recent PCM (3 seconds @ 16 kHz = 48 000 samples). */
  readonly ringBuffer: Float32Array;
  /** Monotonic write index — modulo ringBuffer.length to find current write pos. */
  readonly ringWriteIdx: { current: number };
  /** Suspend inference (e.g. while micState === 'speaking' — defeats TTS self-wake). */
  pause: () => void;
  /** Resume inference + reset prevScore + clear rolling buffers (clean post-TTS). */
  resume: () => void;
  /** Terminate worker, disconnect AudioWorklet, release closures. */
  terminate: () => void;
}
