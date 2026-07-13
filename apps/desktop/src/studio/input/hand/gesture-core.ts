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
 *   - quick-pinch tap (PRIMARY click): a quick pinch that springs back open under
 *     `grabHoldMs` emits `tap` (pinch-bloom recognizer). The exact `grabHoldMs`
 *     split gives grab and tap mutual exclusion: still pinched at T ⇒ grab,
 *     released before ⇒ tap. Reuses the trusted pinch freeze so the aim can't
 *     drift mid-click.
 *
 * The fist family stays close-only, mutually exclusive with the above:
 *   - fist + lateral (horizontal-dominant) palm motion → swipe, latches.
 *   - fist + vertical-dominant palm motion → scroll (fist-drag scroll), the
 *     PRIMARY scroll; the cursor freezes and vertical translation → wheel deltas.
 *   - fist held stationary >= holdMs (no swipe / no scroll) → `collapse`.
 *   - fist that reopens within ~600ms without translating → `tap` (palm-click,
 *     the SECONDARY click — see `palm-click-recognizer.ts`). `collapseFired`
 *     gates palm-click's `engaged`, so once a hold has already fired `collapse`
 *     its eventual release can never ALSO fire a click.
 *
 * Cursor freeze — the cursor tracks the index fingertip, which curls into the
 * palm as a fist closes; so while a fist is held (or a pinch is engaged) the
 * cursor is frozen (no moves emitted) and swipe samples come from the palm
 * centroid. Palm-click freezes its click-aim separately, at `lastCursor` — the
 * last real fingertip position before the fist closed — rather than reusing
 * the palm centroid, since a click should land where the user was POINTING,
 * not where their palm happens to sit.
 */

import {
  DEFAULT_ONE_EURO,
  OneEuroFilter,
  OneEuroFilter2D,
  type OneEuroConfig,
} from "../one-euro";
import {
  createFourFingerScrollRecognizer,
  type FourFingerScrollRecognizer,
} from "../four-finger-scroll-recognizer";
import {
  createIndexScrollRecognizer,
  type IndexScrollRecognizer,
} from "../index-scroll-recognizer";
import {
  createPalmClickRecognizer,
  type PalmClickRecognizer,
} from "../palm-click-recognizer";
import {
  createThumbConfirmRecognizer,
  type ThumbConfirmRecognizer,
} from "../thumb-confirm-recognizer";
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
const THUMB_MCP = 2;
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

/** A thumbs gesture classification, or null when the hand is neither shape. */
export type ThumbGesture = "thumbUp" | "thumbDown" | null;

export type ThumbGestureConfig = {
  /** Thumb extension ratio must exceed this (thumb clearly cocked out). */
  minThumbExtension: number;
  /** Every non-thumb finger's tip/palm ratio must be BELOW this (all curled). */
  maxFingerRatio: number;
  /** |thumb vertical| must exceed this so a sideways thumb is neither up nor down. */
  minThumbVertical: number;
};

export const DEFAULT_THUMB_GESTURE: ThumbGestureConfig = {
  minThumbExtension: 1.15,
  maxFingerRatio: 1.35,
  minThumbVertical: 0.35,
};

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
   * Guards pinch engagement against a closing FIST false-positive (see
   * {@link computePinchShapeValid}): at least one of middle/ring/pinky must
   * stay at or above this tip/palm ratio for the frame to count as a pinch
   * candidate at all, no matter how tight the thumb-index distance reads.
   */
  pinchMinNonPinchFingerRatio: number;
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
  /**
   * Classification thresholds for the thumbs-up / thumbs-down confirm gestures.
   * Passed straight to {@link computeThumbGesture} every frame.
   */
  thumbGesture: ThumbGestureConfig;
  /**
   * Whole-hand openness (the same smoothed scalar that drives resize/scroll)
   * must drop below this for a frame to count as "closed" toward palm-click,
   * ON TOP OF all four fingers individually reading curled — belt-and-
   * suspenders so a partially-curled hand (e.g. mid-scroll-curl) never reads
   * as a closed fist.
   */
  palmClickOpennessThreshold: number;
  /** Ms after close-START within which a reopen fires the palm-click. */
  palmClickReopenWindowMs: number;
  /** Ms a fist can be held before palm-click treats it as cancelled. */
  palmClickCancelMs: number;
  /**
   * Ms the four-finger scroll candidate (curling, not yet a full fist) must be
   * sustained before it actually engages. Guards against a curl-en-route-to-a-
   * fist (the start of a palm-click) false-triggering a scroll before the palm
   * has had a chance to fully close.
   */
  scrollCurlSustainMs: number;
  /**
   * Openness at/above which the hand reads as "held open" rather than curling —
   * the UPPER edge of the four-finger scroll candidate band. Scroll only becomes
   * a candidate once openness dips below this (an active curl) AND stays at/above
   * `palmClickOpennessThreshold` (not yet closed); a held-open hand is not a
   * candidate, so it neither scrolls on its own nor lets the fast curl of a
   * palm-click leak a delta before the sustain dwell can reject it. Camera-tunable
   * (sits between the closed band ~1.35 and a fully open hand ~1.7-2.1).
   */
  scrollArmOpennessCeil: number;
  /**
   * Pre-pinch aim latency (ms). The fingertip drifts while the thumb and index
   * draw together to pinch, so the cursor position AT the engage frame is already
   * off the target the user was aiming at. We keep a short ring buffer of recent
   * filtered cursor positions and, on pinch-engage, re-anchor the frozen cursor
   * (`lastCursor`) to the buffered sample from this many ms BEFORE engage — the
   * Vision-Pro "aim-before-onset" pattern. Both the quick-pinch tap and the grab
   * hover-upgrade then read the pre-drift aim. Kept short so a genuinely moving
   * hand still anchors near where it currently is.
   */
  pinchAnchorLeadMs: number;
  /** Ring-buffer retention (ms) for pre-pinch cursor anchoring. */
  cursorHistoryMs: number;
  /**
   * Pre-curl aim latency (ms) for the SECONDARY palm-click. The whole hand
   * curling drags the fingertip, so the cursor at the fist-commit frame is off
   * the target; palm-click's aim is anchored to the buffered position from this
   * many ms before (the openness falling edge), so a close-to-click lands where
   * the reticle was when the hand began closing. Larger than the pinch lead
   * because a full-hand curl drifts the fingertip more than a two-finger pinch.
   */
  palmClickAimLeadMs: number;
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
  pinchMinNonPinchFingerRatio: 1.35,
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
  thumbGesture: { ...DEFAULT_THUMB_GESTURE },
  // Matches the curl band (curlThreshold) so "closed" for palm-click lines up
  // with each finger's own curled classification.
  palmClickOpennessThreshold: 1.35,
  palmClickReopenWindowMs: 600,
  palmClickCancelMs: 700,
  scrollCurlSustainMs: 250,
  scrollArmOpennessCeil: 1.6,
  // ~110ms of pre-pinch aim recovery: long enough to undo the close-drift, short
  // enough that a fast-moving hand still anchors near its current position.
  pinchAnchorLeadMs: 110,
  cursorHistoryMs: 220,
  // A full-hand curl drifts the fingertip more (and slower) than a pinch, so
  // reach a touch further back for the pre-curl aim.
  palmClickAimLeadMs: 140,
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

/**
 * Guards pinch engagement against a closing FIST false-positive: a full-hand
 * curl also collapses thumb-index distance (the thumb tucks in alongside the
 * curling fingers), so `computePinchRatio` alone can't tell "pinching" from
 * "making a fist" apart. A real pinch keeps middle/ring/pinky reasonably
 * EXTENDED while only the thumb and index draw together; a fist curls all
 * three of those in with the index. Reuses {@link computeFingerRatios}' tip/
 * palm ratios (indices 1/2/3 = middle/ring/pinky; index 0 is the index finger,
 * irrelevant here since the pinch itself is what draws it in) so the shape
 * check shares the same scale/depth-invariant normalization as everything
 * else. Returns true (pinch shape OK) whenever at least one of middle/ring/
 * pinky is above `minNonPinchFingerRatio` — a closing fist curls ALL of them
 * together, so requiring just one to stay extended is enough to reject it
 * while still tolerating a natural pinch where a couple of the idle fingers
 * relax inward.
 */
export function computePinchShapeValid(
  landmarks: Pt[],
  minNonPinchFingerRatio: number,
): boolean {
  const [, middle = 0, ring = 0, pinky = 0] = computeFingerRatios(landmarks);
  return (
    middle >= minNonPinchFingerRatio ||
    ring >= minNonPinchFingerRatio ||
    pinky >= minNonPinchFingerRatio
  );
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

/**
 * Index-tip depth relative to the palm plane, palm-normalized. This was the
 * signal the retired index-jab tap-click watched; palm-click (a whole-hand
 * close-then-open) is now the sole `tap` source, because a jab's driving signal
 * rides the SAME index finger that steers the cursor, so jabbing dragged the
 * aim along with it. The helper is KEPT (shared geometry, still exercised by
 * tests) but is no longer wired to any recognizer.
 *
 * MediaPipe carries a per-landmark `z` (roughly metric depth in the same scale
 * as x, with SMALLER/more-negative = closer to the camera). Diffing the index
 * tip's z against the middle-MCP's z cancels whole-hand distance (moving the
 * hand nearer shifts every z together), so this isolates the index finger
 * *poking forward* out of the palm plane. Dividing by palm size makes it
 * scale-invariant like the other ratios. A resting point reads near 0; a forward
 * jab drives it negative. Returns 0 for a degenerate palm.
 */
export function computeIndexTipDepth(landmarks: Pt[]): number {
  const palm = dist2d(landmarks[WRIST]!, landmarks[MIDDLE_MCP]!);
  if (palm <= 0) return 0;
  return (landmarks[INDEX_TIP]!.z - landmarks[MIDDLE_MCP]!.z) / palm;
}

// ---- Pre-pinch cursor anchoring (aim-before-onset) --------------------------

/** A timestamped filtered-cursor sample kept for pre-pinch aim recovery. */
export type CursorStamp = { t: number; nx: number; ny: number };

/**
 * A tiny time-windowed ring buffer of recent filtered cursor positions. On a
 * pinch-engage the fingertip has already drifted while the thumb/index closed,
 * so the frozen cursor at the engage frame sits off the intended target. This
 * buffer lets the interpreter recover the aim from ~`leadMs` before engage (the
 * Vision-Pro "aim-before-onset" pattern) for both the quick-pinch tap and the
 * grab hover-upgrade. Pure + framework-free; retains only `windowMs` of history.
 */
export type CursorHistory = {
  /** Record a filtered cursor sample. */
  push(t: number, nx: number, ny: number): void;
  /**
   * The buffered sample closest to (t - leadMs), i.e. the aim from `leadMs` ago.
   * Returns null only when the buffer is empty; otherwise the oldest retained
   * sample when the lookback predates all history. Never extrapolates.
   */
  sampleBefore(t: number, leadMs: number): CursorStamp | null;
  reset(): void;
};

export function createCursorHistory(windowMs: number): CursorHistory {
  const buf: CursorStamp[] = [];
  return {
    push(t: number, nx: number, ny: number): void {
      buf.push({ t, nx, ny });
      // Drop samples older than the retention window (keep one straddling sample
      // so a lookback just past the edge still resolves to the nearest history).
      const cutoff = t - windowMs;
      let drop = 0;
      while (drop + 1 < buf.length && buf[drop + 1]!.t < cutoff) drop += 1;
      if (drop > 0) buf.splice(0, drop);
    },
    sampleBefore(t: number, leadMs: number): CursorStamp | null {
      if (buf.length === 0) return null;
      const target = t - leadMs;
      // Walk from newest to oldest; the first sample at//before target is the
      // aim from ~leadMs ago. Falls back to the oldest retained sample.
      for (let i = buf.length - 1; i >= 0; i -= 1) {
        if (buf[i]!.t <= target) return buf[i]!;
      }
      return buf[0]!;
    },
    reset(): void {
      buf.length = 0;
    },
  };
}

// ---- Click-vs-continuous gates (palm-click coexistence) ---------------------

/** Per-frame state a scroll-curl gate needs to decide four-finger engagement. */
export type ScrollCurlGateConfig = {
  /** Continuous ms the curl candidate must hold before scroll actually engages. */
  sustainMs: number;
  /** Openness at/above which the hand is "held open" (NOT a scroll candidate). */
  armOpennessCeil: number;
  /** Openness below which the hand is closing toward a palm-click (abort). */
  closedOpenness: number;
};

export type ScrollCurlGate = {
  /**
   * @param t         frame time (ms)
   * @param openPose  the hand is an open pose, not pinching (the caller's own gate)
   * @param openness  smoothed whole-hand openness scalar this frame
   * @returns whether four-finger scroll may engage this frame
   */
  push(t: number, openPose: boolean, openness: number): boolean;
  reset(): void;
};

/**
 * Dwell gate that decouples a four-finger scroll-curl from a palm-click's fast
 * close. Scroll is a CANDIDATE only while the hand is actively curling — an open
 * pose whose openness has dipped below `armOpennessCeil` (so a held-open hand is
 * never a candidate) but is still at/above `closedOpenness` (so a fully closed
 * fist aborts it). Scroll then ENGAGES only once that candidate has held
 * continuously for `sustainMs`; any frame that breaks the candidate resets the
 * clock. A palm-click drives openness from open → closed within its ~600ms
 * round trip, far faster than `sustainMs`, so the candidate never survives long
 * enough to engage: a close-open click yields ZERO scroll deltas. Because the
 * scroll recognizer re-anchors its openness on the engage edge, the curl consumed
 * by the sustain dwell emits nothing — scroll starts clean once armed.
 */
export function createScrollCurlGate(cfg: ScrollCurlGateConfig): ScrollCurlGate {
  let since: number | null = null;
  return {
    push(t: number, openPose: boolean, openness: number): boolean {
      const candidate =
        openPose && openness < cfg.armOpennessCeil && openness >= cfg.closedOpenness;
      if (!candidate) {
        since = null;
        return false;
      }
      if (since === null) {
        since = t;
        return false;
      }
      return t - since >= cfg.sustainMs;
    },
    reset(): void {
      since = null;
    },
  };
}

/**
 * Whether the open-hand resize may be engaged this frame. Beyond the caller's own
 * "open pose, not pinching" gate, resize DISARMS (a) while a palm-click candidate
 * is in flight — the closing fist would otherwise read as a fast shrink and
 * fling the widget down as the user actually meant to click — and (b) once the
 * hand curls into the closed band, catching the pre-fist ramp the discrete
 * click-state can't see yet. A normal resize-shrink stays well above
 * `closedOpenness`, so this never fights a deliberate shrink.
 */
export function resizeEngageAllowed(
  openPose: boolean,
  pinching: boolean,
  clickClosing: boolean,
  openness: number,
  closedOpenness: number,
): boolean {
  return openPose && !pinching && !clickClosing && openness >= closedOpenness;
}

// ---- Thumb geometry (for the thumbs-up / thumbs-down confirm gestures) -------

/**
 * The thumb's own extension ratio: thumb-tip↔wrist distance normalized by palm
 * size (wrist↔middle-MCP), matching {@link computeFingerRatios}'s idiom so the
 * value is scale/depth-invariant. A curled thumb tucked against the palm reads
 * low; a fully cocked thumb reads high. Returns 0 for a degenerate palm.
 */
export function computeThumbExtension(landmarks: Pt[]): number {
  const palm = dist2d(landmarks[WRIST]!, landmarks[MIDDLE_MCP]!);
  if (palm <= 0) return 0;
  return dist2d(landmarks[THUMB_TIP]!, landmarks[WRIST]!) / palm;
}

/**
 * The thumb's vertical direction in image space, normalized by palm size:
 * (thumb-MCP.y − thumb-tip.y) / palm. MediaPipe y grows DOWNWARD, so a thumb
 * pointing UP puts the tip above the MCP (smaller y) ⇒ POSITIVE; a thumb pointing
 * DOWN ⇒ negative. Using the MCP (not the wrist) as the reference isolates the
 * thumb's own aim from whole-hand tilt. Returns 0 for a degenerate palm.
 */
export function computeThumbVertical(landmarks: Pt[]): number {
  const palm = dist2d(landmarks[WRIST]!, landmarks[MIDDLE_MCP]!);
  if (palm <= 0) return 0;
  return (landmarks[THUMB_MCP]!.y - landmarks[THUMB_TIP]!.y) / palm;
}

/**
 * Classify a raw frame as thumbs-up, thumbs-down, or neither. A thumbs gesture is
 * a fist with ONLY the thumb extended and clearly aimed up or down:
 *   - the four fingers (index/middle/ring/pinky) are all curled (each tip/palm
 *     ratio below `maxFingerRatio` — the same curl band the pose classifier uses),
 *   - the thumb is extended (`computeThumbExtension` above `minThumbExtension`),
 *   - the thumb's vertical aim is decisive (`|computeThumbVertical|` past
 *     `minThumbVertical`), whose SIGN picks up vs down.
 * Pure and instantaneous: the debounce/hold that stops a passing hand from firing
 * lives in the thumb-confirm recognizer, not here.
 */
export function computeThumbGesture(
  landmarks: Pt[],
  config: ThumbGestureConfig = DEFAULT_THUMB_GESTURE,
): ThumbGesture {
  const fingerRatios = computeFingerRatios(landmarks);
  // A degenerate palm yields all-zero ratios; that also fails the thumb tests.
  const allCurled = fingerRatios.every((r) => r > 0 && r < config.maxFingerRatio);
  if (!allCurled) return null;
  if (computeThumbExtension(landmarks) < config.minThumbExtension) return null;
  const vertical = computeThumbVertical(landmarks);
  if (Math.abs(vertical) < config.minThumbVertical) return null;
  return vertical > 0 ? "thumbUp" : "thumbDown";
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
  // Last smoothed cursor position emitted (from `filter`, index-fingertip
  // steering). Kept live even while the cursor is frozen (fist/pinch) so
  // palm-click can freeze its aim at "wherever the hand was last actually
  // aiming" rather than a fist-distorted fingertip position. Re-anchored on a
  // pinch-engage to the pre-drift aim from the cursor history (see below).
  let lastCursor: { nx: number; ny: number } = { nx: 0.5, ny: 0.5 };
  // Rolling filtered-cursor history for pre-pinch aim recovery. Pushed on every
  // cursor emission; read on the pinch-engage rising edge to snap `lastCursor`
  // back to where the hand was aiming ~`pinchAnchorLeadMs` before the pinch
  // closed (the fingertip drifts as thumb+index draw together).
  const cursorHistory = createCursorHistory(cfg.cursorHistoryMs);
  // Last emitted cursor sample (pos + time) for deriving cursor speed, the
  // palm-click velocity gate's input. Null until the first cursor emission.
  let lastCursorSample: { t: number; nx: number; ny: number } | null = null;
  // Smoothed cursor speed (normalized units/sec). Fed to palm-click so a close
  // that begins mid-flick is rejected. Decays to 0 while the cursor is frozen.
  let cursorSpeed = 0;

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

  // Four-finger-curl scroll dwell gate: keeps a curl en route to a fist (the
  // start of a palm-click) from false-triggering a scroll before the palm has
  // had a chance to finish closing. Scroll engages only after ~250ms of a
  // sustained curl that never fully closes; a <600ms close-open click yields
  // zero scroll deltas. See `createScrollCurlGate`.
  const scrollCurlGate = createScrollCurlGate({
    sustainMs: cfg.scrollCurlSustainMs,
    armOpennessCeil: cfg.scrollArmOpennessCeil,
    closedOpenness: cfg.palmClickOpennessThreshold,
  });

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

  // Quick-pinch tap (PRIMARY click): a quick pinch released into an open hand
  // under `grabHoldMs`. The cursor is FROZEN the instant the pinch engages (and
  // re-anchored to the pre-pinch aim), so hover stays pinned to whatever the
  // reticle was over at pinch-start; the hub upgrades the targetless `tap` from
  // that pinned hover. Shares `grabHoldMs` with pinch-hold, so tap and grab are
  // mutually exclusive (held past T ⇒ grab, released before ⇒ tap). Emits the
  // SAME `tap` intent as palm-click, so downstream dispatch is unchanged.
  const pinchBloom: PinchBloomRecognizer = createPinchBloomRecognizer(
    () => callbacks.onIntent({ type: "tap" }),
    { holdMs: cfg.grabHoldMs, bloomWindowMs: cfg.bloomWindowMs },
  );

  // Open-hand resize: an open hand held over a widget arms, then the openness
  // delta scales it. Targetless `resize*` phases — the hub injects the hovered
  // widget and drops the lifecycle when the reticle is over empty space.
  const openHandResize: OpenHandResizeRecognizer = createOpenHandResizeRecognizer(
    (e) => callbacks.onPhase(e),
  );
  // Index-finger scroll: a point pose over a scrollable surface, fingertip
  // velocity → wheel deltas. DEMOTED to a secondary path — the four-finger curl
  // below is now the primary scroll. Palm-click (below) is a FIST gesture, not a
  // point one, so the two never share a pose to begin with. Targetless; the hub
  // gates it on hover.
  const indexScroll: IndexScrollRecognizer = createIndexScrollRecognizer((e) =>
    callbacks.onPhase(e),
  );
  // Four-finger-curl scroll: an open palm whose fingers curl/uncurl together, the
  // openness velocity → wheel deltas. The PRIMARY scroll gesture (orthogonal to
  // the point pose that steers the cursor). Targetless; the hub gates it on hover.
  const fourFingerScroll: FourFingerScrollRecognizer =
    createFourFingerScrollRecognizer((e) => callbacks.onPhase(e));
  // Palm-click: a fist close-then-open within ~600ms. The PRIMARY hand click —
  // emits a targetless `tap` the hub upgrades from the hovered target, so
  // buttons / links / list rows all press through the same pointer synthesis as a
  // pinch-bloom. Replaces the old index-jab tap: closing the whole hand is
  // orthogonal to the index-fingertip cursor steering, so clicking never drags
  // the cursor along with it (a jab's shared index-tip signal did). Aim freezes
  // at close-START (see `lastCursor` below) and a fist held past `cancelMs`
  // without reopening cancels rather than clicking.
  const palmClick: PalmClickRecognizer = createPalmClickRecognizer(
    (i) => callbacks.onIntent(i),
    {
      reopenWindowMs: cfg.palmClickReopenWindowMs,
      cancelMs: cfg.palmClickCancelMs,
    },
  );
  // Thumbs-up / thumbs-down confirm: a sustained (~400ms) thumb answers the send
  // confirm gate — up approves, down cancels. Targetless `confirmApprove` /
  // `confirmCancel` intents; the confirm gate (downstream) decides whether a
  // pending send exists to answer. The hold guards against a passing hand firing.
  const thumbConfirm: ThumbConfirmRecognizer = createThumbConfirmRecognizer((i) =>
    callbacks.onIntent(i),
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
    lastCursor = { nx: 0.5, ny: 0.5 };
    cursorHistory.reset();
    lastCursorSample = null;
    cursorSpeed = 0;
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
    fourFingerScroll.reset();
    scrollCurlGate.reset();
    palmClick.reset();
    thumbConfirm.reset();
  }

  function push(tMs: number, landmarks: Pt[] | null): void {
    if (landmarks === null) {
      if (nullSince === null) nullSince = tMs;
      if (cursorActive && tMs - nullSince >= cfg.lostGraceMs) {
        cursorActive = false;
        callbacks.onCursorActive(false);
        // Hand is truly gone: reset transient gesture state NOW (not lazily on
        // reacquire) so continuous gestures fire their terminal events promptly.
        // Otherwise a hand lost mid-resize/scroll would strand a half-applied
        // widget until the hand returned. `resetTransient` emits resizeEnd/
        // scrollEnd/grabEnd via each recognizer's own reset().
        resetTransient();
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
    // Fist guard: a closing fist also collapses thumb-index distance, so gate
    // engagement (and continued hold) on middle/ring/pinky NOT all curling in
    // with it — see computePinchShapeValid. A fist can never read as a pinch,
    // no matter how tight the raw ratio.
    const pinchShapeOk = computePinchShapeValid(landmarks, cfg.pinchMinNonPinchFingerRatio);
    if (!pinchActive) {
      unpinchSince = null;
      const wantsEngage = pinchRatio < cfg.pinchOnRatio && pinchShapeOk; // tighter on gate
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
          // Pinch just engaged: snap the frozen aim back to the pre-drift
          // position from ~pinchAnchorLeadMs ago. The fingertip drifts as the
          // thumb+index close, so the cursor at this frame is off-target; the
          // history holds where the user was actually pointing. Both the
          // quick-pinch tap (via the frozen cursor the hub/pointer-synth read)
          // and the grab hover-upgrade then land on the pre-pinch aim.
          const aim = cursorHistory.sampleBefore(tMs, cfg.pinchAnchorLeadMs);
          if (aim) {
            lastCursor = { nx: aim.nx, ny: aim.ny };
            callbacks.onCursorMove(aim.nx, aim.ny);
          }
        }
      } else {
        pinchCandidate = null;
        pinchCandidateCount = 0;
      }
    } else {
      pinchCandidate = null;
      pinchCandidateCount = 0;
      // A held pinch that curls into a fist (shape check fails) releases
      // immediately through the same grace path as a ratio pop above — a fist
      // must never be read as a continued pinch/drag.
      const stillPinched = pinchRatio <= cfg.pinchOffRatio && pinchShapeOk; // hold past off gate
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
    // Resize disarms while a palm-click is in flight (this reads last frame's
    // palm-click state — it runs before palmClick.push below — which is fine for a
    // multi-frame candidate) and once the hand curls into the closed band, so the
    // fist of a click never reads as a shrink.
    openHandResize.push({
      t: tMs,
      openness: sOpenness,
      engaged: resizeEngageAllowed(
        pose === "open",
        pinchActive,
        palmClick.state === "closing",
        sOpenness,
        cfg.palmClickOpennessThreshold,
      ),
    });
    const scrollTarget = computeCursorTarget(landmarks, cfg);
    indexScroll.push({
      t: tMs,
      ny: scrollTarget.ny,
      engaged: pose === "point" && !pinchActive,
    });

    // Four-finger-curl scroll (PRIMARY): an open palm whose fingers curl/uncurl
    // together drives the scroll. Reuses the same smoothed openness signal as
    // resize; the two separate by dynamics — a fast curl trips scroll's velocity
    // deadband before resize's 300ms arm dwell completes, while a slow, steady
    // open-hand hold arms a resize without ever crossing scroll's velocity gate.
    // The scroll-curl dwell gate (createScrollCurlGate) sits in front of engage:
    // scroll arms only after ~250ms of a sustained curl that never fully closes,
    // so the fast close of a palm-click never leaks a scroll delta. Targetless;
    // the hub gates it on hover.
    fourFingerScroll.push({
      t: tMs,
      openness: sOpenness,
      engaged: scrollCurlGate.push(tMs, pose === "open" && !pinchActive, sOpenness),
    });

    // Palm-click (SECONDARY click): a whole-hand close-then-open. `closed` is
    // gated on BOTH the pose classifier reading "fist" (which itself requires
    // all four fingers individually curled, via `poseFromFingers`'s hysteresis
    // + debounce) AND the smoothed openness scalar dropping below its own
    // threshold — belt-and-suspenders so a partial curl (e.g. mid-scroll)
    // never reads as a click candidate. `nx/ny` come from the cursor history at
    // the openness FALLING edge (~palmClickAimLeadMs ago), not the drifted
    // fist-frame fingertip, so the click lands where the reticle WAS when the
    // hand began closing. `speed` feeds the recognizer's flick guard (a close
    // begun mid-aim is ignored). `engaged` also drops once `collapseFired` — a
    // fist held long enough to already fire `collapse` must not ALSO fire a
    // click on release, since palm-click's own cancel window (`cancelMs`) is
    // deliberately longer than collapse's `holdMs`.
    const preCurlAim = cursorHistory.sampleBefore(tMs, cfg.palmClickAimLeadMs);
    palmClick.push({
      t: tMs,
      closed: pose === "fist" && sOpenness < cfg.palmClickOpennessThreshold,
      nx: preCurlAim ? preCurlAim.nx : lastCursor.nx,
      ny: preCurlAim ? preCurlAim.ny : lastCursor.ny,
      speed: cursorSpeed,
      engaged: !pinchActive && !collapseFired,
    });

    // Thumbs-up / thumbs-down confirm: classify the raw frame and feed the hold
    // machine. Runs every frame (a thumb reads as a fist by count, so it is fed
    // independent of `pose`); the recognizer's ~400ms dwell is what actually fires.
    // Gated OFF while pinching so a pinch can never masquerade as a thumb.
    thumbConfirm.push({
      t: tMs,
      gesture: pinchActive ? null : computeThumbGesture(landmarks, cfg.thumbGesture),
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
      // Cursor speed (normalized units/sec) for palm-click's flick guard: an
      // EMA of the per-frame displacement rate so a single jittery frame can't
      // spuriously trip or clear the gate.
      if (lastCursorSample) {
        const dtSec = (tMs - lastCursorSample.t) / 1000;
        if (dtSec > 0) {
          const inst =
            Math.hypot(sm.x - lastCursorSample.nx, sm.y - lastCursorSample.ny) / dtSec;
          cursorSpeed = cursorSpeed * 0.6 + inst * 0.4;
        }
      }
      lastCursorSample = { t: tMs, nx: sm.x, ny: sm.y };
      lastCursor = { nx: sm.x, ny: sm.y };
      // Record the pre-drift aim so a subsequent pinch/curl can recover it.
      cursorHistory.push(tMs, sm.x, sm.y);
      callbacks.onCursorMove(sm.x, sm.y);
    }
  }

  return { push, reset: resetTransient };
}
