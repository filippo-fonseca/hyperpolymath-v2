/**
 * MediaPipe HandLandmarker loader — the ONLY module that imports
 * `@mediapipe/tasks-vision`, and it does so via a **dynamic** `import()` inside
 * an async function. Nothing here runs at module scope, so importing this file
 * on the server (SSR / `next build`) is inert: the heavy WASM/GPU bundle is
 * pulled in only when `loadHandLandmarker()` is actually called in the browser.
 *
 * The rest of the codebase (driver, tests) depends only on the structural
 * {@link HandLandmarkerLike} type below — MediaPipe types never leak outward.
 */

/** A single normalized landmark. Structurally matches MediaPipe's output. */
export type LandmarkPoint = { x: number; y: number; z: number };

export type HandLandmarkerResult = { landmarks: LandmarkPoint[][] };

/**
 * The minimal surface the driver needs. Both the real MediaPipe landmarker and
 * test fakes satisfy this without importing any MediaPipe types.
 */
export type HandLandmarkerLike = {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult;
  close(): void;
};

export type LoadHandLandmarkerOptions = {
  /** Directory served with the vendored MediaPipe WASM fileset. */
  wasmBasePath?: string;
  /** Path to the vendored `.task` model. */
  modelAssetPath?: string;
  /** Max hands to track (1 for the single-user dashboard). */
  numHands?: number;
};

const DEFAULT_WASM_BASE = "/models/mediapipe/wasm";
const DEFAULT_MODEL_PATH = "/models/mediapipe/hand_landmarker.task";

/**
 * Loads and initializes a MediaPipe HandLandmarker in VIDEO running mode.
 *
 * Uses the GPU delegate with MediaPipe's internal CPU fallback, so no extra
 * handling is needed on machines without WebGL. Returns a thin adapter typed as
 * {@link HandLandmarkerLike} so the concrete MediaPipe types stay contained.
 */
export async function loadHandLandmarker(
  options: LoadHandLandmarkerOptions = {},
): Promise<HandLandmarkerLike> {
  const wasmBasePath = options.wasmBasePath ?? DEFAULT_WASM_BASE;
  const modelAssetPath = options.modelAssetPath ?? DEFAULT_MODEL_PATH;
  const numHands = options.numHands ?? 1;

  const vision = await import("@mediapipe/tasks-vision");
  const { FilesetResolver, HandLandmarker } = vision;

  const fileset = await FilesetResolver.forVisionTasks(wasmBasePath);
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands,
  });

  return {
    detectForVideo: (video, timestampMs) => landmarker.detectForVideo(video, timestampMs),
    close: () => landmarker.close(),
  };
}
