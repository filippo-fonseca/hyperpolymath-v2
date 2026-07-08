/**
 * Pinch-zoom — a pure scalar processor that turns the thumb-index pinch GAP into
 * a camera-dolly amount, in the same recognizer mold as `pinch-pull-recognizer`.
 *
 * The gap (thumb-tip↔index-tip distance / palm size, i.e. the same ratio the
 * gesture-core pinch classifier uses) is scale- and depth-invariant, so a tighter
 * gap means "zoom in" and a widening gap means "zoom out" — decoupled from where
 * the palm is in frame (the thumb tip is not a palm-centroid anchor, so pan and
 * zoom cannot fight). This replaces the old palm-size `ln` depth proxy, which
 * wobbled as the hand translated and coupled zoom to pan.
 *
 * `push` returns an ABSOLUTE zoom scalar `z ∈ [-1, +1]` measured from a baseline
 * captured on engage (`+1` = fully squeezed ⇒ dolly all the way in). It is fed
 * straight into the pinch-drag recognizer's `depth` channel: because pinch-drag
 * diffs `depth` against its own origin (z ≈ 0 at engage), `dz = z` flows to the
 * camera unchanged — no new phase vocabulary, no U0 contract fork.
 *
 * Robustness is the whole point (hand jitter must never cause runaway zoom):
 *  - the caller feeds a one-euro-smoothed ratio;
 *  - a `deadzone` around the baseline maps to z = 0 (jitter never zooms);
 *  - a hysteresis latch (arm at `deadzone`, disarm at the smaller `exitDeadzone`)
 *    stops ratio noise at the knee from toggle-chattering the active state; the
 *    shaping curve subtracts `exitDeadzone` while armed so z eases continuously
 *    to zero at deactivation and never sign-flips inside the hysteresis band;
 *  - an `emitQuantum` holds the previous z for sub-quantum changes, so a still
 *    pinched hand yields a constant z ⇒ a constant camera target ⇒ the rig
 *    settles (the demand-frame loop is preserved);
 *  - once the hand opens past `offRatio` (a release, or the release-grace blip
 *    window) z is FROZEN at its last value, so a widening-past-off gap can never
 *    fire a spurious zoom-out lurch on release.
 *
 * DOM-free and framework-free, so it is unit-tested with synthetic ratio streams.
 */

export type PinchZoomConfig = {
  /** |closedness| must exceed this (ratio units) before zoom activates. */
  deadzone: number;
  /** Active zoom deactivates below this (< deadzone) — knee hysteresis. */
  exitDeadzone: number;
  /** Closedness → zoom scale. ~0.25 of closedness sweeps the full ±1 at gain 4. */
  gain: number;
  /** Minimum change in z before a new value is reported (else hold the last). */
  emitQuantum: number;
  /**
   * The engage baseline ratio is clamped into `[r0Min, r0Max]`. `r0Max` mirrors
   * `pinchOnRatio` (a pinch only engages below it). `r0Min` is set to the
   * deadzone so a fully-closed engage reads as z = 0 (no zoom-in lurch) while
   * still leaving a little zoom-in headroom for a moderate engage.
   */
  r0Min: number;
  r0Max: number;
  /**
   * Above this ratio the hand is opening (matches gesture-core's `pinchOffRatio`
   * + its release grace): freeze z instead of computing a zoom-out.
   */
  offRatio: number;
};

export const DEFAULT_PINCH_ZOOM: PinchZoomConfig = {
  deadzone: 0.05,
  exitDeadzone: 0.03,
  gain: 4,
  emitQuantum: 0.015,
  r0Min: 0.05,
  r0Max: 0.4,
  offRatio: 0.55,
};

export type PinchZoom = {
  /**
   * Push one frame. `ratio` is the (ideally pre-smoothed) thumb-index gap;
   * `engaged` is the pinch latch. Returns the current absolute zoom scalar
   * `z ∈ [-1, +1]`.
   */
  push(tMs: number, ratio: number, engaged: boolean): number;
  reset(): void;
};

const clampAbs = (v: number, max: number): number => (v < -max ? -max : v > max ? max : v);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Creates a pinch-zoom processor. Deterministic and side-effect-free: the same
 * ratio stream always yields the same z sequence.
 */
export function createPinchZoom(config?: Partial<PinchZoomConfig>): PinchZoom {
  const cfg: PinchZoomConfig = { ...DEFAULT_PINCH_ZOOM, ...config };

  // Baseline ratio captured on engage; null while released.
  let r0: number | null = null;
  // Last reported zoom scalar (the value pinch-drag diffs against its origin).
  let z = 0;
  // Hysteresis latch: true once |closedness| cleared the deadzone.
  let active = false;

  function reset(): void {
    r0 = null;
    z = 0;
    active = false;
  }

  function push(_tMs: number, ratio: number, engaged: boolean): number {
    if (!engaged) {
      reset();
      return 0;
    }
    // A degenerate frame (Infinity ratio from a zero-size palm) must not baseline
    // or pollute the scalar — hold the last value.
    if (!Number.isFinite(ratio)) return z;

    if (r0 === null) {
      r0 = clamp(ratio, cfg.r0Min, cfg.r0Max);
      z = 0;
      active = false;
      return 0;
    }

    // Opening past the off gate (release or a release-grace blip): freeze z so a
    // widening gap on the way out never emits a zoom-out spurt.
    if (ratio > cfg.offRatio) return z;

    const c = r0 - ratio; // positive ⇒ tighter than baseline ⇒ zoom in
    const mag = Math.abs(c);

    // Hysteresis latch: arm only once closedness clears the (larger) deadzone;
    // stay armed until it falls back below the (smaller) exitDeadzone. Jitter
    // that never clears the deadzone can't arm it; noise at the knee can't
    // toggle-chatter it back off.
    if (active) {
      if (mag < cfg.exitDeadzone) active = false;
    } else if (mag > cfg.deadzone) {
      active = true;
    }

    // While armed, shape from the exitDeadzone floor: the magnitude there is
    // always ≥ 0 (we disarm at exactly that floor), so z is continuous down to
    // zero at deactivation and never sign-flips inside the hysteresis band.
    const target = active
      ? clampAbs(Math.sign(c) * Math.max(0, mag - cfg.exitDeadzone) * cfg.gain, 1)
      : 0;

    if (Math.abs(target - z) >= cfg.emitQuantum) z = target;
    return z;
  }

  return { push, reset };
}
