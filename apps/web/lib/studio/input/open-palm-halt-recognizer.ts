/**
 * Open-palm-halt recognizer — a deliberate, debounced "halt" primitive, a pure
 * state machine mirroring `swipe-recognizer.ts`.
 *
 * A flat open palm held still for `holdMs` (~1s) fires a single `halt`. It must
 * NEVER fire on a transient or partial palm, so two gates guard it:
 *   1. Dwell — the palm must be continuously open for `holdMs`. Any non-open
 *      sample fully resets the clock (a flicker restarts from zero).
 *   2. Stillness — drifting more than `maxDriftNx` from the anchor re-anchors at
 *      the current sample, restarting the dwell clock. A moving palm never fires.
 * After firing, it latches until the palm closes, so one hold = one halt.
 *
 * `open` is pre-computed by the caller (gesture-core: pose === open, all four
 * fingers extended, not pinching). Downstream this drives the kill-switch.
 */

export type OpenPalmSample = {
  t: number;
  /** True when the caller classifies this frame as a deliberate flat open palm. */
  open: boolean;
  /** Normalized cursor-space x (0..1) of the palm centroid, for the drift gate. */
  nx: number;
  /** Normalized cursor-space y (0..1) of the palm centroid. */
  ny: number;
};

export type OpenPalmHaltConfig = {
  /** Continuous still-open dwell (ms) before `halt` fires. */
  holdMs: number;
  /** Drift (normalized) from the anchor that restarts the dwell clock. */
  maxDriftNx: number;
};

export const DEFAULT_OPEN_PALM_HALT: OpenPalmHaltConfig = {
  holdMs: 1000,
  maxDriftNx: 0.05,
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

  let anchor: { t: number; nx: number; ny: number } | null = null;
  let fired = false;

  function reset(): void {
    anchor = null;
    fired = false;
  }

  function push(sample: OpenPalmSample): void {
    if (!sample.open) {
      // Any non-open frame breaks the dwell entirely.
      reset();
      return;
    }

    if (anchor === null) {
      anchor = { t: sample.t, nx: sample.nx, ny: sample.ny };
      fired = false;
      return;
    }

    if (fired) return; // latched until the palm closes

    const drift = Math.hypot(sample.nx - anchor.nx, sample.ny - anchor.ny);
    if (drift > cfg.maxDriftNx) {
      // Movement restarts the dwell clock from the current position.
      anchor = { t: sample.t, nx: sample.nx, ny: sample.ny };
      return;
    }

    if (sample.t - anchor.t >= cfg.holdMs) {
      fired = true;
      onHalt();
    }
  }

  return { push, reset };
}
