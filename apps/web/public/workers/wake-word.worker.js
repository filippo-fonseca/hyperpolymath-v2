// Phase 12 Plan 12-01 — openWakeWord 3-stage inference in a Web Worker.
// Loaded via: new Worker('/workers/wake-word.worker.js', { type: 'module' })
// ORT runtime self-hosted at /voice/ (reuses Phase 7's vad-web infrastructure).
//
// Pipeline per openWakeWord v0.5.1 + Deep Core Labs writeup
// (https://deepcorelabs.com/open-wake-word-on-the-web/):
//   PCM 80ms 16kHz → melspectrogram.onnx → embedding_model.onnx → hey_jarvis_v0.1.onnx → score
// D-05: fire only when score > 0.5 over 2 consecutive 80ms frames.
//
// postMessage architecture (deliberate — see 12-RESEARCH §"Cross-Origin
// Isolation Decision"): zero-copy shared memory paths are NOT used; the
// worker receives transferable Float32Array via postMessage. 64 KB/sec
// of GC pressure is negligible on desktop targets and we avoid breaking
// Stripe / Google OAuth / ElevenLabs embeds.

import * as ort from "/voice/ort-wasm-simd-threaded.mjs";

// Per Pitfall 1: wasmPaths must be absolute (resolves against page origin,
// not worker URL).
ort.env.wasm.wasmPaths = "/voice/";
// Single-threaded: no cross-origin-isolation headers required.
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false; // We ARE the worker; do not nest.
ort.env.logLevel = "warning";

let melSession = null;
let embSession = null;
let classifierSession = null;
let paused = false;

// Rolling buffers per RESEARCH §"Pattern 2".
const SPEC_WINDOW_SIZE = 76;
const SPEC_STRIDE = 8;
const EMB_WINDOW_SIZE = 16;
let melBuffer = []; // mel frames (each a Float32Array of mel bins)
let embBuffer = []; // embeddings (each Float32Array length emb-dim)
let prevScore = 0; // D-05 consecutive-frame guard

async function init() {
  try {
    self.postMessage({ type: "progress", msg: "Loading mel model…" });
    melSession = await ort.InferenceSession.create(
      "/wake-word/melspectrogram.onnx",
    );

    self.postMessage({ type: "progress", msg: "Loading embedding model…" });
    embSession = await ort.InferenceSession.create(
      "/wake-word/embedding_model.onnx",
    );

    self.postMessage({ type: "progress", msg: "Loading classifier…" });
    classifierSession = await ort.InferenceSession.create(
      "/wake-word/hey_jarvis_v0.1.onnx",
    );

    // DIAGNOSTIC-ONLY tensor-shape introspection. This reads ORT private
    // internals (`handler._inputs[0].shape`) which can vanish between ORT
    // versions — wrapped in try/catch with fallback to []. The `shapes`
    // postMessage is NOT a runtime invariant; an empty payload here does
    // NOT block wake-word inference (the three InferenceSession.create
    // calls above are the actual readiness gate). See RESEARCH Open
    // Question 1 — fallback to empty arrays is acceptable.
    try {
      const melInfo = melSession.handler?._inputs?.[0]?.shape ?? null;
      const embInfo = embSession.handler?._inputs?.[0]?.shape ?? null;
      const clsInfo = classifierSession.handler?._inputs?.[0]?.shape ?? null;
      self.postMessage({
        type: "shapes",
        mel: melInfo ? Array.from(melInfo) : [],
        emb: embInfo ? Array.from(embInfo) : [],
        cls: clsInfo ? Array.from(clsInfo) : [],
      });
    } catch {
      // Non-fatal; shapes message is diagnostic.
      self.postMessage({ type: "shapes", mel: [], emb: [], cls: [] });
    }

    self.postMessage({ type: "ready" });
  } catch (err) {
    self.postMessage({
      type: "error",
      error: err && err.message ? err.message : String(err),
    });
  }
}

function flatten(arr) {
  let total = 0;
  for (const a of arr) total += a.length;
  const out = new Float32Array(total);
  let idx = 0;
  for (const a of arr) {
    out.set(a, idx);
    idx += a.length;
  }
  return out;
}

async function processFrame(pcm) {
  if (!melSession || !embSession || !classifierSession) return;

  // Stage 1: mel-spectrogram.
  const pcmTensor = new ort.Tensor("float32", pcm, [1, 1280]);
  const melOut = await melSession.run({
    [melSession.inputNames[0]]: pcmTensor,
  });
  const melData = melOut[melSession.outputNames[0]].data;
  // Apply openWakeWord normalization: (value / 10) + 2.
  for (let i = 0; i < melData.length; i++) melData[i] = melData[i] / 10 + 2;

  // openWakeWord emits 5 mel frames per 80ms chunk. Chunk and push.
  const framesPerChunk = 5;
  const binsPerFrame = melData.length / framesPerChunk;
  for (let f = 0; f < framesPerChunk; f++) {
    const slice = new Float32Array(binsPerFrame);
    for (let b = 0; b < binsPerFrame; b++)
      slice[b] = melData[f * binsPerFrame + b];
    melBuffer.push(slice);
  }

  // Stage 2: embedding (slide window of 76 mel frames by 8 frames per step).
  while (melBuffer.length >= SPEC_WINDOW_SIZE) {
    const window = flatten(melBuffer.slice(0, SPEC_WINDOW_SIZE));
    const embIn = new ort.Tensor("float32", window, [
      1,
      SPEC_WINDOW_SIZE,
      binsPerFrame,
    ]);
    const embOut = await embSession.run({
      [embSession.inputNames[0]]: embIn,
    });
    const embData = embOut[embSession.outputNames[0]].data;
    embBuffer.push(new Float32Array(embData));
    if (embBuffer.length > EMB_WINDOW_SIZE) embBuffer.shift();
    melBuffer.splice(0, SPEC_STRIDE);
  }

  // Stage 3: classifier (when 16 embeddings accumulated).
  if (embBuffer.length === EMB_WINDOW_SIZE) {
    const flat = flatten(embBuffer);
    const embDim = flat.length / EMB_WINDOW_SIZE;
    const classIn = new ort.Tensor("float32", flat, [1, EMB_WINDOW_SIZE, embDim]);
    const classOut = await classifierSession.run({
      [classifierSession.inputNames[0]]: classIn,
    });
    const score = classOut[classifierSession.outputNames[0]].data[0];

    // D-05 consecutive-frame guard.
    if (score > 0.5 && prevScore > 0.5) {
      self.postMessage({ type: "wake", score });
      prevScore = 0; // Reset so a 3+ frame run doesn't double-trigger.
    } else {
      prevScore = score;
    }
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === "init") return; // init runs on module load below.
  if (msg.type === "pause") {
    paused = true;
    return;
  }
  if (msg.type === "resume") {
    paused = false;
    prevScore = 0;
    melBuffer = [];
    embBuffer = [];
    return;
  }
  if (msg.type === "frame" && !paused) {
    try {
      await processFrame(msg.pcm);
    } catch (err) {
      self.postMessage({
        type: "error",
        error: err && err.message ? err.message : String(err),
      });
    }
  }
};

init();
