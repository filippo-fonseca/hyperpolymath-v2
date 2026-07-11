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
 * Three non-colliding gesture families:
 *   - open OR point hand: the cursor tracks the index fingertip (steering).
 *   - pinch (thumb-index): camera navigation. A moving pinch pans (palm centroid)
 *     and dollies (palm-depth via pinch-dolly); the cursor is FROZEN throughout,
 *     and a pinch held over a widget past `grabHoldMs` becomes a grab (pinch-hold).
 *   - pinch-bloom: a quick pinch that springs back open under `grabHoldMs` emits
 *     `expand` (pinch-bloom recognizer). The exact `grabHoldMs` split gives grab
 *     and bloom mutual exclusion: still pinched at T ⇒ grab, released before ⇒ bloom.
 *
 * The fist family stays close-only, mutually exclusive with the above:
 *   - fist + lateral palm motion → swipe (shared recognizer), latches.
 *   - fist held >= holdMs (no swipe) → `collapse`, fired once at the threshold.
 *
 * Cursor freeze — the cursor tracks the index fingertip, which curls into the
 * palm as a fist closes; so while a fist is held (or a pinch is engaged) the
 * cursor is frozen (no moves emitted) and swipe samples come from the palm centroid.
 */

import {
  DEFAULT_ONE_EURO,
  OneEuroFilter,
  OneEuroFilter2D,
  type OneEuroConfig,
} from "../one-euro";
import {
  createIndexScrollRecognizer,
  type IndexScrollRecognizer,
} from "../index-scroll-recognizer";
import {
  createOpenHandResizeRecognizer,
  type OpenHandResizeRecognizer,
} from "../open-hand-resize-recognizer";
import {
  createOpenPalmHaltRecognizer,
  type OpenPalmHaltRecognizer,
} from "../open-palm-halt-recognizer";
import {
  createPinchBloomRecognizer,
  type PinchBloomRecognizer,
} from "../pinch-bloom-recognizer";
import { createPinchDolly, type PinchDolly } from "../pinch-dolly";
import {
  createPinchDragRecognizer,
  type PinchDragRecognizer,
} from "../pinch-drag-recognizer";
import {
  createPinchHoldRecognizer,
  type PinchHoldRecognizer,
} from "../pinch-hold-recognizer";
import {
  createSwipeRecognizer,
  type SwipeConfig,
  type SwipeRecognizer,
} from "../swipe-recognizer";
import type { StudioIntentInput, StudioPhaseInput } from "../types";

// ---- Geometry primitives ---------------------------------------------------

/** A landmark point. `z` is carried for shape-compat with MediaPipe but unused. */
export type Pt = { x: number; y: number; z: number };

export type HandPose = "open" | "fist" | "point";

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Image-plane (2D) Euclidean distance. z is deliberately ignored (unreliable). */
export const dist2d = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

// MediaPipe hand landmark indices we read.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
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
  /** Pinch engages when the thumb-index ratio drops below this. */
  pinchOnRatio: number;
  /** Pinch releases when the thumb-index ratio rises above this (hysteresis). */
  pinchOffRatio: number;
  /**
   * Sustained ms the raw ratio must stay above `pinchOffRatio` before an engaged
   * pinch actually releases. A shorter un-pinch blip (tracker landmark pop during
   * a fast drag) is absorbed, so a continuously-held pinch never drops its drag
   * anchor mid-gesture. Engage stays frame-debounced (deliberate gestures commit
   * fast); only release is time-graced.
   */
  pinchReleaseGraceMs: number;
  /**
   * Max hand-lost gap (ms) that a held pinch survives. When landmarks return
   * within this window while `pinchActive`, the reacquire-reset is skipped so the
   * drag anchor + filters live on across a single MediaPipe dropout (≤ this many
   * ms). Kept ≤ `lostGraceMs` so the cursor never de-activates first. A longer
   * loss still does the full transient reset.
   */
  pinchLostGraceMs: number;
  /**
   * Continuous pinch dwell (ms) that separates a grab from a bloom. Pinch-hold
   * and pinch-bloom SHARE this threshold, so they are mutually exclusive: still
   * pinched at T ⇒ grab, released before T ⇒ bloom-open.
   */
  grabHoldMs: number;
  /** Grace (ms) after a bloom release for the open pose to catch up (debounce lag). */
  bloomWindowMs: number;
  /** Deliberate palm-push held this long ⇒ halt. */
  haltHoldMs: number;
  /** Palm drift (normalized) that re-anchors the halt dwell clock. */
  haltMaxDriftNx: number;
  /** Palm size must exceed this ×baseline (a push toward the camera) to arm halt. */
  haltPushRatio: number;
  /** 1-euro smoothing config for the pinch-drag palm centroid. */
  dragOneEuro: OneEuroConfig;
  /**
   * 1-euro smoothing config for the whole-hand openness signal that drives the
   * open-hand resize gesture. Deliberately LOWER minCutoff/beta than the cursor
   * so openness lags a touch and rejects jitter hard — a resize should feel
   * smooth and unhurried, never twitchy, at the cost of a little latency.
   */
  opennessOneEuro: OneEuroConfig;
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
  pinchOnRatio: 0.4,
  pinchOffRatio: 0.55,
  pinchReleaseGraceMs: 150,
  pinchLostGraceMs: 200,
  grabHoldMs: 350,
  bloomWindowMs: 150,
  haltHoldMs: 1200,
  haltMaxDriftNx: 0.06,
  haltPushRatio: 1.28,
  dragOneEuro: { ...DEFAULT_ONE_EURO },
  // Heavier smoothing than the cursor: lower minCutoff = calmer at rest, tiny
  // beta = little speed-up on fast opens. Resize should never feel jumpy.
  opennessOneEuro: { minCutoff: 0.6, beta: 0.008, dCutoff: 1.0 },
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

/**
 * Pose from the per-finger extended pattern (index, middle, ring, pinky). An
 * index-only point is disambiguated FIRST so it never reads as a fist (which,
 * by count alone, it would). `null` means ambiguous — keep the prior pose.
 */
export function poseFromFingers(
  extended: boolean[],
  config: HandGestureConfig,
): HandPose | null {
  const [index = false, middle = false, ring = false, pinky = false] = extended;
  if (index && !middle && !ring && !pinky) return "point";
  const count = extended.reduce((n, e) => n + (e ? 1 : 0), 0);
  return poseFromExtendedCount(count, config);
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

/**
 * Pinch ratio: thumb-tip↔index-tip distance normalized by palm size, so it is
 * scale- and depth-invariant. Smaller ⇒ tighter pinch. Returns Infinity for a
 * degenerate (zero-size) palm so a bad frame can never register as pinched.
 */
export function computePinchRatio(landmarks: Pt[]): number {
  const palm = dist2d(landmarks[WRIST]!, landmarks[MIDDLE_MCP]!);
  if (palm <= 0) return Infinity;
  return dist2d(landmarks[THUMB_TIP]!, landmarks[INDEX_TIP]!) / palm;
}

/** Raw apparent palm size (wrist↔middle-MCP) — a monotonic depth proxy. */
export function computePalmSizeRaw(landmarks: Pt[]): number {
  return dist2d(landmarks[WRIST]!, landmarks[MIDDLE_MCP]!);
}

/**
 * Whole-hand openness scalar: the mean of the four per-finger tip/palm ratios
 * ({@link computeFingerRatios}). Because each ratio is palm-normalized
 * (wrist↔middle-MCP), the mean is inherently scale- and depth-invariant, exactly
 * like the pinch ratio. A closed fist reads ≈ 1.0-1.3; a fully open hand ≈
 * 1.7-2.1. This is the signal the open-hand resize gesture watches: not an
 * absolute pose test but a DELTA from a captured baseline, so the user resizes by
 * *changing* how open their hand is, not by matching a fixed openness. Returns 0
 * for a degenerate (zero-size) palm (all ratios are then 0).
 */
export function computeHandOpenness(landmarks: Pt[]): number {
  const ratios = computeFingerRatios(landmarks);
  let sum = 0;
  for (const r of ratios) sum += r;
  return sum / ratios.length;
}

// ---- Interpreter ------------------------------------------------------------

export type HandGestureCallbacks = {
  onCursorMove(nx: number, ny: number): void;
  onCursorActive(active: boolean): void;
  onIntent(intent: StudioIntentInput): void;
  onPhase(phase: StudioPhaseInput): void;
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
  let palmFilter = new OneEuroFilter2D(cfg.dragOneEuro);
  // Smooths the raw palm size (wrist↔middle-MCP), the pinch-dolly depth signal.
  let sizeFilter = new OneEuroFilter(cfg.dragOneEuro);
  // Smooths the whole-hand openness scalar that drives open-hand resize. Heavier
  // (lower cutoff/beta) than the cursor so resize is calm, never twitchy.
  let opennessFilter = new OneEuroFilter(cfg.opennessOneEuro);
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

  // Pinch mode (mutually exclusive with the fist family): engage is frame-
  // debounced; release is time-graced (see `unpinchSince`) so a transient
  // un-pinch blip never drops a held drag.
  let pinchActive = false;
  let pinchCandidate: boolean | null = null;
  let pinchCandidateCount = 0;
  // Wall-clock ms at which the raw ratio first rose above `pinchOffRatio` while
  // pinched; null while genuinely pinched. Release commits once the un-pinch has
  // been sustained `pinchReleaseGraceMs`.
  let unpinchSince: number | null = null;

  const swipe: SwipeRecognizer = createSwipeRecognizer((dir) => {
    swipeFired = true;
    callbacks.onIntent({ type: dir });
  }, swipeConfig);

  const pinchDrag: PinchDragRecognizer = createPinchDragRecognizer((e) =>
    callbacks.onPhase(e),
  );
  const pinchHold: PinchHoldRecognizer = createPinchHoldRecognizer(
    (e) => callbacks.onPhase(e),
    { holdMs: cfg.grabHoldMs },
  );
  // Turns the smoothed palm size (a monotonic depth proxy) into an absolute dolly
  // scalar z ∈ [-1, +1] fed straight into pinch-drag's `depth` channel. Baselined
  // on engage (z = 0 there by construction, so no engage lurch), and frozen while
  // the pinch is releasing so opening the hand never emits a dolly spurt.
  const pinchDolly: PinchDolly = createPinchDolly();
  const halt: OpenPalmHaltRecognizer = createOpenPalmHaltRecognizer(
    () => callbacks.onIntent({ type: "halt" }),
    { holdMs: cfg.haltHoldMs, maxDriftNx: cfg.haltMaxDriftNx, pushRatio: cfg.haltPushRatio },
  );

  // Pinch-bloom opens a widget: a quick pinch released into an open hand under
  // `grabHoldMs`. The cursor is FROZEN while pinched, so hover stays pinned to
  // whatever the reticle was over at pinch-start; the hub upgrades the targetless
  // `expand` from that pinned hover. Shares `grabHoldMs` with pinch-hold, so grab
  // and bloom are mutually exclusive (held past T ⇒ grab, released before ⇒ bloom).
  const pinchBloom: PinchBloomRecognizer = createPinchBloomRecognizer(
    () => callbacks.onIntent({ type: "expand" }),
    { holdMs: cfg.grabHoldMs, bloomWindowMs: cfg.bloomWindowMs },
  );

  // Open-hand resize: an open hand held over a widget arms, then the openness
  // delta scales it. Targetless `resize*` phases — the hub injects the hovered
  // widget and drops the lifecycle when the reticle is over empty space.
  const openHandResize: OpenHandResizeRecognizer = createOpenHandResizeRecognizer(
    (e) => callbacks.onPhase(e),
  );
  // Index-finger scroll: a point pose over a scrollable surface, fingertip
  // velocity → wheel deltas. Also targetless; the hub gates it on hover.
  const indexScroll: IndexScrollRecognizer = createIndexScrollRecognizer((e) =>
    callbacks.onPhase(e),
  );

  function resetTransient(): void {
    filter = new OneEuroFilter2D(cfg.oneEuro);
    palmFilter = new OneEuroFilter2D(cfg.dragOneEuro);
    sizeFilter = new OneEuroFilter(cfg.dragOneEuro);
    opennessFilter = new OneEuroFilter(cfg.opennessOneEuro);
    fingerExtended = [true, true, true, true];
    pose = "open";
    candidatePose = null;
    candidateCount = 0;
    fistStart = null;
    fistOrigin = null;
    swipeFired = false;
    collapseFired = false;
    pinchActive = false;
    pinchCandidate = null;
    pinchCandidateCount = 0;
    unpinchSince = null;
    swipe.reset();
    // Terminal events so a hand-lost gap never strands a consumer mid-gesture.
    pinchDrag.reset();
    pinchHold.reset();
    pinchDolly.reset();
    halt.reset();
    pinchBloom.reset();
    openHandResize.reset();
    indexScroll.reset();
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
    // Exception — a held pinch survives a short dropout: if we were pinching and
    // landmarks returned within `pinchLostGraceMs`, skip the reset so the drag
    // anchor, filters, and pinch latch carry across the gap (the one-euro filters
    // absorb the large dt) and the pan resumes without a stall or re-anchor.
    if (nullSince !== null) {
      const softReacquire = pinchActive && tMs - nullSince < cfg.pinchLostGraceMs;
      if (!softReacquire) resetTransient();
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
    const rawPose = poseFromFingers(fingerExtended, cfg);

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

    // --- Pinch classification: hysteresis (on/off ratios), asymmetric commit. ---
    // Engage is frame-debounced (a deliberate pinch commits in a few frames);
    // release is time-graced (a brief ratio pop above off, common when motion
    // blur degrades the thumb/index landmarks during a fast drag, is absorbed so
    // a continuously-held pinch never drops its drag anchor mid-gesture).
    const pinchRatio = computePinchRatio(landmarks);
    if (!pinchActive) {
      unpinchSince = null;
      const wantsEngage = pinchRatio < cfg.pinchOnRatio; // tighter on gate
      if (wantsEngage) {
        if (pinchCandidate === true) {
          pinchCandidateCount += 1;
        } else {
          pinchCandidate = true;
          pinchCandidateCount = 1;
        }
        if (pinchCandidateCount >= cfg.debounceFrames) {
          pinchActive = true;
          pinchCandidate = null;
          pinchCandidateCount = 0;
        }
      } else {
        pinchCandidate = null;
        pinchCandidateCount = 0;
      }
    } else {
      pinchCandidate = null;
      pinchCandidateCount = 0;
      const stillPinched = pinchRatio <= cfg.pinchOffRatio; // hold past off gate
      if (stillPinched) {
        unpinchSince = null;
      } else {
        if (unpinchSince === null) unpinchSince = tMs;
        if (tMs - unpinchSince >= cfg.pinchReleaseGraceMs) {
          pinchActive = false;
          unpinchSince = null;
        }
      }
    }

    const palm = computePalmCentroidNormalized(landmarks, cfg);
    const sPalm = palmFilter.filter(tMs, palm.nx, palm.ny);
    const sSize = sizeFilter.filter(tMs, computePalmSizeRaw(landmarks));

    // Camera dolly rides the smoothed palm size (a monotonic depth proxy): a hand
    // approaching the camera grows the palm ⇒ dolly in. pinch-dolly baselines on
    // engage (z = 0 there, so no lurch) and freezes while the pinch is releasing
    // (`unpinchSince` set) so opening the hand never emits a spurious dolly. The
    // scalar feeds pinch-drag's `depth` channel, which diffs it against its engage
    // origin, so dz = z flows to the camera. Pan reads the palm centroid and dolly
    // reads palm size, so the two are decoupled.
    const dolly = pinchDolly.push(tMs, sSize, pinchActive, unpinchSince !== null);

    // --- Pinch mode (deviation D5): top-level, mutually exclusive with the fist
    // family. While pinching we freeze the cursor, clear any fist anchors, and
    // starve the swipe/collapse machinery (engaged=false) so a pinch can never
    // masquerade as a fist gesture. The pinch recognizers run every frame. ---
    if (pinchActive) {
      fistStart = null;
      fistOrigin = null;
      swipeFired = false;
      collapseFired = false;
      candidatePose = null;
      candidateCount = 0;
    }

    pinchDrag.push({
      t: tMs,
      nx: sPalm.x,
      ny: sPalm.y,
      // Absolute palm-depth dolly scalar (z ∈ [-1, +1]); pinch-drag diffs it
      // against its engage origin, so dz = z flows to the camera dolly directly.
      depth: dolly,
      engaged: pinchActive,
    });
    pinchHold.push({ t: tMs, nx: sPalm.x, ny: sPalm.y, engaged: pinchActive });
    halt.push({
      t: tMs,
      open: pose === "open" && extendedCount === 4 && !pinchActive,
      nx: sPalm.x,
      ny: sPalm.y,
      size: sSize,
    });

    // Pinch-bloom: a quick pinch released into an open hand emits `expand`. It
    // runs every frame (before the pinch early-return below) so it observes both
    // the engaged frames and the release edge. `openPose` gates the release: a
    // pinch that springs open blooms; a pinch that curls into a fist never does.
    // The cursor is frozen while pinched, so hover stays pinned to pinch-start and
    // the hub upgrades the targetless `expand` from that pinned hover.
    pinchBloom.push({ t: tMs, engaged: pinchActive, openPose: pose === "open" });

    // Open-hand resize + index-finger scroll run every frame (before the pinch
    // early-return) so their falling edges always fire. Both are gated OFF while
    // pinching (pinch stays reserved for drag/dolly). The openness signal is
    // heavily smoothed; the cursor ny drives scroll. Both emit TARGETLESS start
    // phases — the hub injects the hovered widget/surface and drops the whole
    // lifecycle over empty space, so "resize/scroll only over a widget" falls out
    // of the same hover gate that grab already uses.
    const sOpenness = opennessFilter.filter(tMs, computeHandOpenness(landmarks));
    openHandResize.push({
      t: tMs,
      openness: sOpenness,
      engaged: pose === "open" && !pinchActive,
    });
    const scrollTarget = computeCursorTarget(landmarks, cfg);
    indexScroll.push({
      t: tMs,
      ny: scrollTarget.ny,
      engaged: pose === "point" && !pinchActive,
    });

    if (pinchActive) {
      // Skip pose-edge / swipe / collapse / cursor entirely while pinching.
      swipe.push({ t: tMs, nx: palm.nx, ny: palm.ny, engaged: false });
      return;
    }

    // --- Pose edges. A fist only closes (collapse) / swipes; opening a widget is
    // the pinch-bloom above. Edges fire on any non-fist⇄fist transition so entering
    // a fist from a point (not just open) still anchors the gesture. ---
    if (prevPose !== "fist" && pose === "fist") {
      // Rising edge: anchor the fist gesture and freeze the cursor.
      fistStart = tMs;
      fistOrigin = { nx: palm.nx, ny: palm.ny };
      swipeFired = false;
      collapseFired = false;
    } else if (prevPose === "fist" && pose !== "fist") {
      // Falling edge: clear the fist anchors so no stale swipe/collapse leaks past.
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

    // --- Cursor: emit while open OR pointing (both aim); frozen while fist held. ---
    if (pose === "open" || pose === "point") {
      const target = computeCursorTarget(landmarks, cfg);
      const sm = filter.filter(tMs, target.nx, target.ny);
      callbacks.onCursorMove(sm.x, sm.y);
    }
  }

  return { push, reset: resetTransient };
}
