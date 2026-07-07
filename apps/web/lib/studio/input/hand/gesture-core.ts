/**
 * Hand gesture core — PURE landmark math + the interpreter state machine.
 *
 * This module has NO DOM dependency and NO MediaPipe import. It consumes plain
 * `{x, y, z}[]` landmark arrays (image-normalized 0..1, unmirrored, exactly the
 * shape MediaPipe emits) and turns a stream of them into the Studio input
 * contract: cursor moves, cursor-active flips, and targetless discrete intents.
 * Keeping it MediaPipe-free means the whole thing is unit-testable with synthetic
 * hands and zero browser/GPU dependencies.
 *
 * Gesture disambiguation (deviation 1) — the three fist-family gestures are made
 * mutually exclusive:
 *   - fist + lateral palm motion  → swipe (shared recognizer), latches.
 *   - quick fist pulse (close→open, stationary, < holdMs) → `expand` (air-click).
 *   - fist held >= holdMs (no swipe) → `collapse`, fired once at the threshold.
 *
 * Cursor freeze (deviation 2) — the cursor tracks the index fingertip, which
 * curls into the palm as a fist closes; so while a fist is held the cursor is
 * frozen (no moves emitted) and swipe samples come from the palm centroid.
 */

import {
  DEFAULT_ONE_EURO,
  OneEuroFilter2D,
  type OneEuroConfig,
} from "../one-euro";
import {
  createSwipeRecognizer,
  type SwipeConfig,
  type SwipeRecognizer,
} from "../swipe-recognizer";
import type { StudioIntentInput } from "../types";

// ---- Geometry primitives ---------------------------------------------------

/** A landmark point. `z` is carried for shape-compat with MediaPipe but unused. */
export type Pt = { x: number; y: number; z: number };

export type HandPose = "open" | "fist";

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Image-plane (2D) Euclidean distance. z is deliberately ignored (unreliable). */
export const dist2d = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

// MediaPipe hand landmark indices we read.
const WRIST = 0;
const MIDDLE_MCP = 9;
/** Fingertip landmarks for index, middle, ring, pinky (thumb ignored). */
const FINGER_TIPS = [8, 12, 16, 20] as const;
/** Palm anchor points: wrist + the four finger MCPs. */
const PALM_POINTS = [0, 5, 9, 13, 17] as const;

/** Remap a normalized coordinate through the interaction box, clamped to 0..1. */
export const remapInset = (v: number, inset: number): number =>
  clamp01((v - inset) / (1 - 2 * inset));

// ---- Config -----------------------------------------------------------------

export type HandGestureConfig = {
  /** Interaction-box inset so the user needn't reach the frame edges. */
  inset: number;
  /** 1-euro smoothing config for the cursor. */
  oneEuro: OneEuroConfig;
  /** Finger counts as extended above this tip/palm ratio. */
  extendThreshold: number;
  /** Finger counts as curled below this ratio (hysteresis band between). */
  curlThreshold: number;
  /** Consecutive agreeing frames required before a pose flip commits. */
  debounceFrames: number;
  /** extendedCount <= this ⇒ fist candidate. */
  fistMaxExtended: number;
  /** extendedCount >= this ⇒ open candidate. */
  openMinExtended: number;
  /** Continuous ms of lost hand before the cursor is marked inactive. */
  lostGraceMs: number;
  /** Fist held at least this long (no swipe) ⇒ collapse. */
  holdMs: number;
  /** Max palm drift (normalized) between fist-origin and release to still expand. */
  maxClickDriftNx: number;
};

export const DEFAULT_HAND_GESTURE: HandGestureConfig = {
  inset: 0.15,
  oneEuro: { ...DEFAULT_ONE_EURO },
  extendThreshold: 1.6,
  curlThreshold: 1.35,
  debounceFrames: 3,
  fistMaxExtended: 1,
  openMinExtended: 3,
  lostGraceMs: 250,
  holdMs: 500,
  maxClickDriftNx: 0.06,
};

// ---- Pure pose math ---------------------------------------------------------

/**
 * The four tip/palm extension ratios (index, middle, ring, pinky). A larger
 * ratio means the tip is farther from the wrist relative to palm size — i.e.
 * the finger is extended. Returns all-zeros if the palm has zero size.
 */
export function computeFingerRatios(landmarks: Pt[]): number[] {
  const palm = dist2d(landmarks[WRIST]!, landmarks[MIDDLE_MCP]!);
  if (palm <= 0) return FINGER_TIPS.map(() => 0);
  return FINGER_TIPS.map((tip) => dist2d(landmarks[tip]!, landmarks[WRIST]!) / palm);
}

/** Per-finger hysteresis: only flips at the thresholds, else keeps prior state. */
export function classifyFinger(
  ratio: number,
  prevExtended: boolean,
  config: HandGestureConfig,
): boolean {
  if (ratio > config.extendThreshold) return true;
  if (ratio < config.curlThreshold) return false;
  return prevExtended;
}

/** Pose from extended-finger count. `null` means ambiguous — keep prior pose. */
export function poseFromExtendedCount(
  count: number,
  config: HandGestureConfig,
): HandPose | null {
  if (count <= config.fistMaxExtended) return "fist";
  if (count >= config.openMinExtended) return "open";
  return null;
}

/** Raw (unfiltered) cursor target from the index fingertip: mirror x, remap. */
export function computeCursorTarget(
  landmarks: Pt[],
  config: HandGestureConfig,
): { nx: number; ny: number } {
  const tip = landmarks[8]!;
  return {
    nx: remapInset(1 - tip.x, config.inset),
    ny: remapInset(tip.y, config.inset),
  };
}

/** Palm centroid in raw image-normalized coords (average of the palm anchors). */
export function computePalmCentroid(landmarks: Pt[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const i of PALM_POINTS) {
    sx += landmarks[i]!.x;
    sy += landmarks[i]!.y;
  }
  return { x: sx / PALM_POINTS.length, y: sy / PALM_POINTS.length };
}

/** Palm centroid mirrored + remapped into cursor space (for swipe sampling). */
export function computePalmCentroidNormalized(
  landmarks: Pt[],
  config: HandGestureConfig,
): { nx: number; ny: number } {
  const c = computePalmCentroid(landmarks);
  return { nx: remapInset(1 - c.x, config.inset), ny: remapInset(c.y, config.inset) };
}

// ---- Interpreter ------------------------------------------------------------

export type HandGestureCallbacks = {
  onCursorMove(nx: number, ny: number): void;
  onCursorActive(active: boolean): void;
  onIntent(intent: StudioIntentInput): void;
};

export type HandGestureInterpreter = {
  /** Push a frame. `landmarks === null` means no hand detected this frame. */
  push(tMs: number, landmarks: Pt[] | null): void;
  /** Fully reset transient state (filters, pose, latches). */
  reset(): void;
};

/**
 * Builds the frame-driven interpreter. Callbacks map 1:1 onto the driver's sink.
 * The swipe recognizer is the SHARED one (not hand-rolled) so thresholds stay
 * consistent with the mouse driver.
 */
export function createHandGestureInterpreter(
  callbacks: HandGestureCallbacks,
  gestureConfig?: Partial<HandGestureConfig>,
  swipeConfig?: Partial<SwipeConfig>,
): HandGestureInterpreter {
  const cfg: HandGestureConfig = { ...DEFAULT_HAND_GESTURE, ...gestureConfig };

  let filter = new OneEuroFilter2D(cfg.oneEuro);
  let fingerExtended: boolean[] = [true, true, true, true];
  let pose: HandPose = "open";
  let candidatePose: HandPose | null = null;
  let candidateCount = 0;

  let cursorActive = false;
  let nullSince: number | null = null;

  // Fist-gesture tracking.
  let fistStart: number | null = null;
  let fistOrigin: { nx: number; ny: number } | null = null;
  let swipeFired = false;
  let collapseFired = false;

  const swipe: SwipeRecognizer = createSwipeRecognizer((dir) => {
    swipeFired = true;
    callbacks.onIntent({ type: dir });
  }, swipeConfig);

  function resetTransient(): void {
    filter = new OneEuroFilter2D(cfg.oneEuro);
    fingerExtended = [true, true, true, true];
    pose = "open";
    candidatePose = null;
    candidateCount = 0;
    fistStart = null;
    fistOrigin = null;
    swipeFired = false;
    collapseFired = false;
    swipe.reset();
  }

  function push(tMs: number, landmarks: Pt[] | null): void {
    if (landmarks === null) {
      if (nullSince === null) nullSince = tMs;
      if (cursorActive && tMs - nullSince >= cfg.lostGraceMs) {
        cursorActive = false;
        callbacks.onCursorActive(false);
      }
      return;
    }

    // Reacquired after a null gap: reset transient state so no stale fist/filter
    // leaks across the gap (deviation: filters + fist state reset on reacquire).
    if (nullSince !== null) {
      resetTransient();
      nullSince = null;
    }

    if (!cursorActive) {
      cursorActive = true;
      callbacks.onCursorActive(true);
    }

    // --- Pose classification with per-finger hysteresis + frame debounce ---
    const ratios = computeFingerRatios(landmarks);
    fingerExtended = ratios.map((r, i) => classifyFinger(r, fingerExtended[i]!, cfg));
    const extendedCount = fingerExtended.reduce((n, e) => n + (e ? 1 : 0), 0);
    const rawPose = poseFromExtendedCount(extendedCount, cfg);

    const prevPose = pose;
    if (rawPose !== null && rawPose !== pose) {
      if (candidatePose === rawPose) {
        candidateCount += 1;
      } else {
        candidatePose = rawPose;
        candidateCount = 1;
      }
      if (candidateCount >= cfg.debounceFrames) {
        pose = rawPose;
        candidatePose = null;
        candidateCount = 0;
      }
    } else {
      candidatePose = null;
      candidateCount = 0;
    }

    const palm = computePalmCentroidNormalized(landmarks, cfg);

    // --- Pose edges ---
    if (prevPose === "open" && pose === "fist") {
      // Rising edge: anchor the fist gesture and freeze the cursor.
      fistStart = tMs;
      fistOrigin = { nx: palm.nx, ny: palm.ny };
      swipeFired = false;
      collapseFired = false;
    } else if (prevPose === "fist" && pose === "open") {
      // Falling edge: a stationary, swipe-less, collapse-less pulse = expand.
      if (!swipeFired && !collapseFired && fistOrigin) {
        const drift = Math.hypot(palm.nx - fistOrigin.nx, palm.ny - fistOrigin.ny);
        if (drift < cfg.maxClickDriftNx) {
          callbacks.onIntent({ type: "expand" });
        }
      }
      fistStart = null;
      fistOrigin = null;
      swipeFired = false;
      collapseFired = false;
    }

    // --- Swipe (shared recognizer). Engaged only while a fist is committed. ---
    // Its onSwipe callback sets swipeFired + emits, so feed it before collapse.
    swipe.push({ t: tMs, nx: palm.nx, ny: palm.ny, engaged: pose === "fist" });

    // --- Collapse: sustained fist with no swipe. ---
    if (
      pose === "fist" &&
      fistStart !== null &&
      !swipeFired &&
      !collapseFired &&
      tMs - fistStart >= cfg.holdMs
    ) {
      callbacks.onIntent({ type: "collapse" });
      collapseFired = true;
    }

    // --- Cursor: emit only while open; frozen (silent) while fist held. ---
    if (pose === "open") {
      const target = computeCursorTarget(landmarks, cfg);
      const sm = filter.filter(tMs, target.nx, target.ny);
      callbacks.onCursorMove(sm.x, sm.y);
    }
  }

  return { push, reset: resetTransient };
}
