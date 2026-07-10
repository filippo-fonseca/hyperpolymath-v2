/**
 * HandTrackingDriver — drives the Studio dashboard from the webcam via MediaPipe
 * HandLandmarker. It implements the same {@link StudioInputDriver} contract as
 * the mouse driver: it emits stage-normalized cursor moves and targetless
 * intents, and never resolves hover (the hub does that).
 *
 * LIBRARY BOUNDARY: this module ships the driver + its status surface. It does
 * NOT register itself anywhere and does NOT mount the provider — a later wave
 * gates registration (and the camera-permission prompt `start()` triggers)
 * behind a consent flow. Construct it inert; nothing touches the camera until
 * `start()` is called.
 *
 * MediaPipe is reached only through {@link loadHandLandmarker}, which does a
 * dynamic `import()` — so importing this file on the server / during `next build`
 * pulls in no WASM and stays SSR-clean.
 */

import {
  createHandGestureInterpreter,
  type HandGestureConfig,
  type HandGestureInterpreter,
} from "../hand/gesture-core";
import {
  loadHandLandmarker,
  type HandLandmarkerLike,
} from "../hand/landmarker";
import { acquireWebcam, type WebcamHandle } from "../hand/webcam";
import type { SwipeConfig } from "../swipe-recognizer";
import type {
  StudioDriverEnv,
  StudioInputDriver,
  StudioInputSink,
} from "../types";

export type HandDriverStatus =
  | { state: "idle" }
  | { state: "loading-model" }
  | { state: "awaiting-permission" }
  | { state: "running"; handVisible: boolean }
  | {
      state: "error";
      reason: "insecure-context" | "permission-denied" | "no-camera" | "model-load-failed";
    };

export type HandTrackingDriverOptions = {
  /** Notified on every status transition — the Wave-4 onboarding UX seam. */
  onStatusChange?: (status: HandDriverStatus) => void;
  gesture?: Partial<HandGestureConfig>;
  swipe?: Partial<SwipeConfig>;

  // ---- Test seams (default to the real browser implementations) ----
  loadLandmarker?: () => Promise<HandLandmarkerLike>;
  acquireWebcam?: () => Promise<WebcamHandle>;
  now?: () => number;
  scheduleFrame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
};

const defaultScheduleFrame: (cb: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number;

const defaultCancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === "function"
    ? (id) => cancelAnimationFrame(id)
    : (id) => clearTimeout(id);

const defaultNow: () => number =
  typeof performance !== "undefined" ? () => performance.now() : () => Date.now();

/** Maps a getUserMedia rejection to the driver's error reason. */
function webcamErrorReason(err: unknown): "permission-denied" | "no-camera" {
  const name =
    err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  return "no-camera";
}

export class HandTrackingDriver implements StudioInputDriver {
  readonly id = "hand";

  private readonly options: HandTrackingDriverOptions;
  private readonly hasInjectedWebcam: boolean;
  private readonly loadLandmarkerFn: () => Promise<HandLandmarkerLike>;
  private readonly acquireWebcamFn: () => Promise<WebcamHandle>;
  private readonly now: () => number;
  private readonly scheduleFrame: (cb: () => void) => number;
  private readonly cancelFrame: (id: number) => void;

  private status: HandDriverStatus = { state: "idle" };
  private sink: StudioInputSink | null = null;
  /** Bumped on every start()/stop() to invalidate in-flight async init + loops. */
  private generation = 0;
  private landmarker: HandLandmarkerLike | null = null;
  private webcam: WebcamHandle | null = null;
  private interpreter: HandGestureInterpreter | null = null;
  private frameId: number | null = null;
  private lastVideoTime = -1;

  constructor(options: HandTrackingDriverOptions = {}) {
    this.options = options;
    this.hasInjectedWebcam = typeof options.acquireWebcam === "function";
    this.loadLandmarkerFn = options.loadLandmarker ?? (() => loadHandLandmarker());
    this.acquireWebcamFn = options.acquireWebcam ?? (() => acquireWebcam());
    this.now = options.now ?? defaultNow;
    this.scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame;
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame;
  }

  getStatus(): HandDriverStatus {
    return this.status;
  }

  start(sink: StudioInputSink, _env: StudioDriverEnv): void {
    if (this.sink) return; // already started; ignore double-start

    // Fast-fail on SSR / insecure context for the real webcam path. Skipped when
    // a webcam seam is injected (tests own their environment).
    if (!this.hasInjectedWebcam && !environmentSupported()) {
      this.setStatus({ state: "error", reason: "insecure-context" });
      return; // sink left unset so a later start() can retry
    }

    this.sink = sink;
    const generation = ++this.generation;

    this.interpreter = createHandGestureInterpreter(
      {
        onCursorMove: (nx, ny) => this.sink?.moveCursor(nx, ny),
        onCursorActive: (active) => this.sink?.setCursorActive(active),
        onIntent: (intent) => this.sink?.emitIntent(intent),
        onPhase: (phase) => this.sink?.emitPhase(phase),
      },
      this.options.gesture,
      this.options.swipe,
    );

    this.setStatus({ state: "loading-model" });
    void this.init(generation);
  }

  private async init(generation: number): Promise<void> {
    let landmarker: HandLandmarkerLike;
    try {
      landmarker = await this.loadLandmarkerFn();
    } catch {
      if (generation !== this.generation) return;
      this.setStatus({ state: "error", reason: "model-load-failed" });
      return;
    }
    if (generation !== this.generation) {
      landmarker.close();
      return;
    }
    this.landmarker = landmarker;

    this.setStatus({ state: "awaiting-permission" });

    let webcam: WebcamHandle;
    try {
      webcam = await this.acquireWebcamFn();
    } catch (err) {
      if (generation !== this.generation) return;
      this.setStatus({ state: "error", reason: webcamErrorReason(err) });
      return;
    }
    if (generation !== this.generation) {
      webcam.stop(); // stop() raced init: don't leak the stream
      return;
    }
    this.webcam = webcam;

    this.lastVideoTime = -1;
    this.setStatus({ state: "running", handVisible: false });
    this.frameId = this.scheduleFrame(this.loop);
  }

  private readonly loop = (): void => {
    if (!this.webcam || !this.landmarker || !this.interpreter) return;
    const video = this.webcam.video;
    // Snapshot the generation: `interpreter.push` can emit an intent whose
    // subscriber calls `stop()` synchronously (e.g. open-palm halt disabling
    // hand control mid-frame). If it does, `stop()` bumps `generation` and nulls
    // `frameId`; rescheduling below would resurrect a dead loop and leak a frame.
    const generation = this.generation;

    // Only run detection on a fresh frame (currentTime advances per decoded frame).
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      const t = this.now();
      const result = this.landmarker.detectForVideo(video, t);
      const landmarks = result.landmarks[0] ?? null;
      this.interpreter.push(t, landmarks);

      if (generation !== this.generation) return; // stopped mid-frame; do not reschedule

      const handVisible = landmarks !== null;
      if (this.status.state === "running" && this.status.handVisible !== handVisible) {
        this.setStatus({ state: "running", handVisible });
      }
    }

    this.frameId = this.scheduleFrame(this.loop);
  };

  stop(): void {
    // Invalidate any in-flight init or scheduled loop first.
    this.generation += 1;
    if (this.frameId !== null) {
      this.cancelFrame(this.frameId);
      this.frameId = null;
    }
    if (this.webcam) {
      this.webcam.stop();
      this.webcam = null;
    }
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
    this.interpreter?.reset();
    this.interpreter = null;
    this.sink = null;
    this.lastVideoTime = -1;
    this.setStatus({ state: "idle" });
  }

  private setStatus(status: HandDriverStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}

/** True when the current environment can plausibly grant camera access. */
function environmentSupported(): boolean {
  if (typeof window !== "undefined" && window.isSecureContext === false) return false;
  if (typeof navigator === "undefined") return false;
  const md = navigator.mediaDevices;
  return !!md && typeof md.getUserMedia === "function";
}

// ---- Library boundary re-exports (single import surface) --------------------

export {
  DEFAULT_HAND_GESTURE,
  type HandGestureConfig,
} from "../hand/gesture-core";
export {
  loadHandLandmarker,
  type HandLandmarkerLike,
  type LoadHandLandmarkerOptions,
} from "../hand/landmarker";
export { acquireWebcam, type WebcamHandle } from "../hand/webcam";
