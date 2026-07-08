/**
 * Pinch-dolly — a pure scalar processor that turns HAND DEPTH (palm size) into a
 * camera-dolly amount while pinched. It is the depth half of pinched navigation:
 * one pinch drives pan (palm translation) and dolly (palm approach) together.
 *
 * The driving signal is the smoothed palm size (wrist↔middleMCP), the same proxy
 * pinch-pull used for resize before resize was removed — freeing this channel for
 * depth. Moving the hand toward the camera grows the palm; that maps to a dolly-in
 * ("pull the world closer"), matching the grab-the-world metaphor pan already uses.
 * This replaces the old thumb-index-gap zoom, which fought the pinch latch itself
 * (squeezing the gap toward the pinch threshold while zooming) and read as clunky.
 *
 * `push` returns an ABSOLUTE dolly scalar `z ∈ [-1, +1]` measured from a baseline
 * palm size captured on engage: `z = clamp(gain · log2(size / size0), ±1)`, so a
 * grown palm (positive octaves) reads positive. It feeds the pinch-drag `depth`
 * channel unchanged: pinch-drag diffs depth against its engage origin (z = 0 at
 * engage here BY CONSTRUCTION, so no baseline clamp is needed — unlike the thumb
 * gap, palm size at engage is itself the zero point), so `dz = z` flows straight
 * to the camera dolly.
 *
 * Robustness (hand jitter must never cause runaway dolly), ported verbatim from the
 * thumb-gap signal it replaces:
 *  - the caller feeds a one-euro-smoothed palm size;
 *  - a `deadzone` around the baseline maps to z = 0 (jitter never dollies);
 *  - a hysteresis latch (arm at `deadzone`, disarm at the smaller `exitDeadzone`)
 *    stops noise at the knee from toggle-chattering the active state; the shaping
 *    curve subtracts `exitDeadzone` while armed so z eases continuously to zero at
 *    deactivation and never sign-flips inside the hysteresis band;
 *  - an `emitQuantum` holds the previous z for sub-quantum changes, so a still hand
 *    yields a constant z ⇒ a constant camera target ⇒ the demand-frame rig settles;
 *  - while `releasing` (the pinch-release grace window, where palm size wobbles as
 *    the fingers open) z is FROZEN at its last value, so opening the hand can never
 *    fire a spurious dolly lurch on the way out. This replaces pinch-zoom's thumb-gap
 *    `offRatio` freeze, which has no palm-size analog.
 *
 * DOM-free and framework-free, so it is unit-tested with synthetic size streams.
 */

export type PinchDollyConfig = {
  /** |octaves| of palm-size change must exceed this before the dolly activates. */
  deadzone: number;
  /** Active dolly deactivates below this (< deadzone) — knee hysteresis. */
  exitDeadzone: number;
  /** Octaves → dolly scale. At gain 2 a ~1.4x palm approach sweeps the full ±1. */
  gain: number;
  /** Minimum change in z before a new value is reported (else hold the last). */
  emitQuantum: number;
};

export const DEFAULT_PINCH_DOLLY: PinchDollyConfig = {
  deadzone: 0.04,
  exitDeadzone: 0.02,
  gain: 2,
  emitQuantum: 0.015,
};

export type PinchDolly = {
  /**
   * Push one frame. `size` is the (ideally pre-smoothed) palm size; `engaged` is
   * the pinch latch; `releasing` is true during the pinch-release grace window
   * (raw pinch dropped but the latch is still held by grace), during which z is
   * frozen. Returns the current absolute dolly scalar `z ∈ [-1, +1]`.
   */
  push(tMs: number, size: number, engaged: boolean, releasing: boolean): number;
  reset(): void;
};

const clampAbs = (v: number, max: number): number => (v < -max ? -max : v > max ? max : v);

/**
 * Creates a pinch-dolly processor. Deterministic and side-effect-free: the same
 * size stream always yields the same z sequence.
 */
export function createPinchDolly(config?: Partial<PinchDollyConfig>): PinchDolly {
  const cfg: PinchDollyConfig = { ...DEFAULT_PINCH_DOLLY, ...config };

  // Baseline palm size captured on engage; null while released.
  let size0: number | null = null;
  // Last reported dolly scalar (the value pinch-drag diffs against its origin).
  let z = 0;
  // Hysteresis latch: true once |octaves| cleared the deadzone.
  let active = false;

  function reset(): void {
    size0 = null;
    z = 0;
    active = false;
  }

  function push(_tMs: number, size: number, engaged: boolean, releasing: boolean): number {
    if (!engaged) {
      reset();
      return 0;
    }
    // A degenerate frame (non-finite or non-positive palm size from coincident
    // landmarks) must not baseline or pollute the scalar — hold the last value.
    if (!Number.isFinite(size) || size <= 0) return z;

    if (size0 === null) {
      size0 = size;
      z = 0;
      active = false;
      return 0;
    }

    // Releasing (pinch-release grace): the fingers are opening and palm size
    // wobbles — freeze z so the way out never emits a dolly lurch.
    if (releasing) return z;

    const c = Math.log(size / size0) / Math.LN2; // signed octaves; + ⇒ palm grew ⇒ hand nearer ⇒ dolly in
    const mag = Math.abs(c);

    // Hysteresis latch: arm only once the change clears the (larger) deadzone;
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

    // emitQuantum gates MOTION, not the rest value: when the latch is inactive the
    // dolly must return FULLY to neutral, so snap straight to 0 rather than
    // quantum-holding a sub-quantum residual (which would otherwise trap a small
    // permanent dolly offset for the rest of the pinch).
    if (!active) z = 0;
    else if (Math.abs(target - z) >= cfg.emitQuantum) z = target;
    return z;
  }

  return { push, reset };
}
