/**
 * Open-palm-halt recognizer — a deliberate, debounced "halt" primitive, a pure
 * state machine mirroring `swipe-recognizer.ts`.
 *
 * A relaxed open palm is the resting/aiming pose, so a still open palm ALONE
 * must never halt. The trigger is a deliberate "talk-to-the-hand" shove: the
 * palm pushed toward the camera and held still for `holdMs` (~1.2s). Three gates
 * guard it:
 *   1. Push — the apparent palm size must exceed `pushRatio`× a baseline size
 *      (captured when the palm first opens, i.e. the relaxed aiming distance).
 *      A relaxed palm sits at ~baseline and never arms; only a shove forward,
 *      which enlarges the palm, arms the dwell clock.
 *   2. Dwell — the palm must stay pushed-and-open continuously for `holdMs`. Any
 *      non-open sample fully resets (a flicker restarts from zero); dropping back
 *      below the push threshold clears the dwell clock.
 *   3. Stillness — drifting more than `maxDriftNx` from the hold anchor re-anchors
 *      at the current sample, restarting the dwell clock. A moving palm never fires.
 * After firing, it latches until the palm closes, so one shove = one halt.
 *
 * `open` is pre-computed by the caller (gesture-core: pose === open, all four
 * fingers extended, not pinching). `size` is the apparent palm size (a monotonic
 * depth proxy — bigger = closer). Downstream this drives the kill-switch.
 */

export type OpenPalmSample = {
  t: number;
  /** True when the caller classifies this frame as a deliberate flat open palm. */
  open: boolean;
  /** Normalized cursor-space x (0..1) of the palm centroid, for the drift gate. */
  nx: number;
  /** Normalized cursor-space y (0..1) of the palm centroid. */
  ny: number;
  /** Apparent palm size (monotonic depth proxy); grows as the palm nears the camera. */
  size: number;
};

export type OpenPalmHaltConfig = {
  /** Continuous still-pushed-open dwell (ms) before `halt` fires. */
  holdMs: number;
  /** Drift (normalized) from the hold anchor that restarts the dwell clock. */
  maxDriftNx: number;
  /** Palm size must exceed this ×baseline (relaxed open size) to arm the dwell. */
  pushRatio: number;
};

export const DEFAULT_OPEN_PALM_HALT: OpenPalmHaltConfig = {
  holdMs: 1200,
  maxDriftNx: 0.06,
  pushRatio: 1.28,
};

export type OpenPalmHaltRecognizer = {
  push(sample: OpenPalmSample): void;
  reset(): void;
};

/**
 * Creates an open-palm-halt recognizer. `onHalt` fires at most once per
 * continuous open-palm hold.
 */
export function createOpenPalmHaltRecognizer(
  onHalt: () => void,
  config?: Partial<OpenPalmHaltConfig>,
): OpenPalmHaltRecognizer {
  const cfg: OpenPalmHaltConfig = { ...DEFAULT_OPEN_PALM_HALT, ...config };

  // Relaxed open-palm size, captured the frame the palm opens (aiming distance).
  let baseline: number | null = null;
  // Stillness clock for the pushed hold; null until the palm is pushed forward.
  let holdAnchor: { t: number; nx: number; ny: number } | null = null;
  let fired = false;

  function reset(): void {
    baseline = null;
    holdAnchor = null;
    fired = false;
  }

  function push(sample: OpenPalmSample): void {
    if (!sample.open) {
      // Any non-open frame breaks the gesture entirely (palm closed / lost).
      reset();
      return;
    }

    if (baseline === null) {
      // First open frame: anchor the relaxed baseline size, nothing armed yet.
      baseline = sample.size;
      holdAnchor = null;
      fired = false;
      return;
    }

    if (fired) return; // latched until the palm closes

    // Push gate: only a palm shoved toward the camera (enlarged past the relaxed
    // baseline) accrues dwell. A still, relaxed aiming palm never arms.
    if (sample.size < baseline * cfg.pushRatio) {
      holdAnchor = null;
      return;
    }

    if (holdAnchor === null) {
      holdAnchor = { t: sample.t, nx: sample.nx, ny: sample.ny };
      return;
    }

    const drift = Math.hypot(sample.nx - holdAnchor.nx, sample.ny - holdAnchor.ny);
    if (drift > cfg.maxDriftNx) {
      // Movement restarts the dwell clock from the current position.
      holdAnchor = { t: sample.t, nx: sample.nx, ny: sample.ny };
      return;
    }

    if (sample.t - holdAnchor.t >= cfg.holdMs) {
      fired = true;
      onHalt();
    }
  }

  return { push, reset };
}
