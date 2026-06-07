"use client";

import {
  WAKE_PREROLL_SAMPLES,
  WAKE_RING_BUFFER_SAMPLES,
  WAKE_WORD_ASSETS_PATH,
  WAKE_WORD_WORKER_URL,
  WAKE_WORD_WORKLET_URL,
} from "@/lib/voice/constants";
import type {
  WakeWordHandle,
  WakeWordWorkerMessage,
} from "@/lib/voice/wake-word-types";

/**
 * Phase 12 Plan 12-01 — main-thread spawner for the on-device wake-word pipeline.
 *
 * Lazy-load contract (WAKE-01): the four ONNX assets + worker + worklet are
 * NOT fetched on module import. `spawnWakeWordWorker()` (or the asset-only
 * `prefetchWakeWordAssets()`) initiates the downloads. Cached after first
 * call so subsequent calls return the live handle without re-loading.
 *
 * postMessage architecture (deliberate — see 12-RESEARCH §"Cross-Origin
 * Isolation Decision"): zero-copy shared memory paths are NOT used; the
 * worker receives transferable Float32Array via postMessage. 64 KB/sec
 * of GC pressure is negligible on desktop targets and we avoid breaking
 * Stripe / Google OAuth / ElevenLabs embeds.
 *
 * Singleton pattern: same module-level singleton + closure idiom as
 * lib/voice/use-voice-settings.ts (CLAUDE.md bans global stores; this is
 * not a store — it's a hardware resource handle).
 */

let cached: WakeWordHandle | null = null;
let inflight: Promise<WakeWordHandle> | null = null;

export interface SpawnOptions {
  audioContext: AudioContext;
  micStream: MediaStream;
  onWake: (preRoll: Float32Array) => void;
  onProgress?: (msg: string) => void;
  onShapes?: (shapes: {
    mel: readonly number[];
    emb: readonly number[];
    cls: readonly number[];
  }) => void;
}

export interface PrefetchOptions {
  /** Receives an integer 0..100 representing fraction of asset bytes warmed. */
  onProgress?: (pct: number) => void;
}

/** Asset URLs warmed by prefetchWakeWordAssets + later opened by the worker. */
const WAKE_WORD_ASSET_URLS: readonly string[] = [
  `${WAKE_WORD_ASSETS_PATH}hey_jarvis_v0.1.onnx`,
  `${WAKE_WORD_ASSETS_PATH}melspectrogram.onnx`,
  `${WAKE_WORD_ASSETS_PATH}embedding_model.onnx`,
  `${WAKE_WORD_ASSETS_PATH}silero_vad.onnx`,
  // ORT WASM is already self-hosted from Phase 7; warm it too so the
  // worker's first ort.InferenceSession.create() hits the disk, not the
  // network.
  "/voice/ort-wasm-simd-threaded.wasm",
];

/**
 * Warm the browser HTTP cache for the wake-word ONNX assets + ORT WASM
 * WITHOUT spawning the worker, initializing ORT, or registering any onWake
 * listener.
 *
 * Used by Plan 12-03's EnableVoiceModal to drive a "Loading voice assets…"
 * progress spinner during first-enable. Critical that this does NOT call
 * spawnWakeWordWorker — the singleton pattern would bind the modal's
 * permanent no-op onWake to the cached handle, then JarvisListener's
 * later spawn would receive the same handle and never see real wakes.
 *
 * After this resolves, JarvisListener's subsequent spawnWakeWordWorker()
 * call performs the real spawn but the asset fetches inside it resolve
 * instantly from the HTTP cache populated here.
 */
export async function prefetchWakeWordAssets(
  opts?: PrefetchOptions,
): Promise<void> {
  const total = WAKE_WORD_ASSET_URLS.length;
  let done = 0;
  opts?.onProgress?.(0);
  // Sequential rather than parallel so progress reporting is meaningful.
  // Total payload is ~10 MB; even on a 50 Mbps connection that's a few
  // seconds, and a serial download keeps the spinner advancing visibly.
  for (const url of WAKE_WORD_ASSET_URLS) {
    // `cache: 'force-cache'` tells the browser: if there's any cached
    // response (even stale), use it; otherwise fetch + cache. Idempotent
    // and zero-cost on warm cache.
    await fetch(url, { cache: "force-cache" });
    done += 1;
    opts?.onProgress?.(Math.round((done / total) * 100));
  }
}

/**
 * Splice the last `samples` PCM values out of a circular ring buffer
 * in chronological order. Exported for direct testing (WAKE-03).
 */
export function spliceRingPreroll(
  ring: Float32Array,
  writeIdx: { current: number },
  samples: number,
): Float32Array {
  const out = new Float32Array(samples);
  const len = ring.length;
  // Start position = writeIdx - samples, mod len (handles wrap).
  const start = (((writeIdx.current - samples) % len) + len) % len;
  for (let i = 0; i < samples; i++) {
    out[i] = ring[(start + i) % len];
  }
  return out;
}

function waitForReady(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent<WakeWordWorkerMessage>) => {
      if (e.data?.type === "ready") {
        worker.removeEventListener("message", handler);
        resolve();
      } else if (e.data?.type === "error") {
        worker.removeEventListener("message", handler);
        reject(new Error(e.data.error));
      }
    };
    worker.addEventListener("message", handler);
  });
}

export async function spawnWakeWordWorker(
  opts: SpawnOptions,
): Promise<WakeWordHandle> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    opts.onProgress?.("Loading voice assets…");

    // 1. Pre-fetch the four ONNX files in parallel so the browser cache
    //    populates and the spinner has wall-clock work to show. The
    //    worker itself will also load them via ort.InferenceSession.create
    //    but the browser cache means it hits the disk, not the network.
    //    (If prefetchWakeWordAssets() ran earlier, these resolve instantly.)
    const assetUrls = [
      `${WAKE_WORD_ASSETS_PATH}hey_jarvis_v0.1.onnx`,
      `${WAKE_WORD_ASSETS_PATH}melspectrogram.onnx`,
      `${WAKE_WORD_ASSETS_PATH}embedding_model.onnx`,
      `${WAKE_WORD_ASSETS_PATH}silero_vad.onnx`,
    ];
    await Promise.all(assetUrls.map((u) => fetch(u)));

    // 2. Spawn the worker (module-type for ESM import of ort).
    opts.onProgress?.("Starting worker…");
    const worker = new Worker(WAKE_WORD_WORKER_URL, { type: "module" });

    worker.addEventListener(
      "message",
      (e: MessageEvent<WakeWordWorkerMessage>) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.type === "progress") opts.onProgress?.(msg.msg);
        else if (msg.type === "shapes") opts.onShapes?.(msg);
        else if (msg.type === "error")
          console.error("[wake-word-worker]", msg.error);
      },
    );

    await waitForReady(worker);

    // 3. Mount the AudioWorklet on the existing audioContext.
    await opts.audioContext.audioWorklet.addModule(WAKE_WORD_WORKLET_URL);
    const source = opts.audioContext.createMediaStreamSource(opts.micStream);
    const tap = new AudioWorkletNode(opts.audioContext, "wake-word-tap");
    source.connect(tap); // analysis-only — NOT connected to destination

    // 4. Main-thread ring buffer mirror (3 sec @ 16 kHz = 48 000 samples).
    const ringBuffer = new Float32Array(WAKE_RING_BUFFER_SAMPLES);
    const ringWriteIdx = { current: 0 };

    // 5. Tap → ring + worker.
    tap.port.onmessage = (e: MessageEvent) => {
      const data = e.data as { type: string; pcm: Float32Array };
      if (data?.type !== "frame" || !data.pcm) return;
      const frame = data.pcm;
      // Write into ring (mod arithmetic).
      for (let i = 0; i < frame.length; i++) {
        ringBuffer[(ringWriteIdx.current + i) % ringBuffer.length] = frame[i];
      }
      ringWriteIdx.current += frame.length;
      // Forward a transferable copy to the worker.
      const copy = frame.slice();
      worker.postMessage({ type: "frame", pcm: copy }, [copy.buffer]);
    };

    // 6. Worker → onWake with 500 ms pre-roll spliced from ring.
    worker.addEventListener(
      "message",
      (e: MessageEvent<WakeWordWorkerMessage>) => {
        if (e.data?.type !== "wake") return;
        const preRoll = spliceRingPreroll(
          ringBuffer,
          ringWriteIdx,
          WAKE_PREROLL_SAMPLES,
        );
        opts.onWake(preRoll);
      },
    );

    const handle: WakeWordHandle = {
      worker,
      ringBuffer,
      ringWriteIdx,
      pause: () => worker.postMessage({ type: "pause" }),
      resume: () => worker.postMessage({ type: "resume" }),
      terminate: () => {
        try {
          tap.disconnect();
        } catch {
          /* already disconnected */
        }
        try {
          source.disconnect();
        } catch {
          /* already disconnected */
        }
        worker.terminate();
        cached = null;
        inflight = null;
      },
    };
    cached = handle;
    return handle;
  })();

  try {
    const h = await inflight;
    return h;
  } finally {
    inflight = null;
  }
}

/** Tear down the cached handle (idempotent). Used by listening-mode switches in Plan 12-03. */
export function terminateWakeWordWorker(): void {
  cached?.terminate();
  cached = null;
  inflight = null;
}

/** Sync read for non-React callers — returns null when not yet spawned. */
export function getWakeWordHandle(): WakeWordHandle | null {
  return cached;
}
