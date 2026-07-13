/**
 * Shared, driver-agnostic swipe recognizer — a pure state machine with no DOM.
 *
 * Both the mouse driver (Shift+drag) and the future hand driver (fist held +
 * lateral palm motion) reduce to the same shape: "engaged + horizontal
 * displacement within a time window." Centralizing it here keeps thresholds
 * consistent and makes the gesture math independently testable.
 */

export type SwipeSample = { t: number; nx: number; ny: number; engaged: boolean };

export type SwipeConfig = {
  /** Minimum normalized horizontal displacement to count as a swipe. */
  minDx: number;
  /** Maximum time (ms) from engage-origin within which the swipe must complete. */
  maxMs: number;
  /** Reject swipes whose |dy| exceeds |dx| * maxDyRatio (too vertical). */
  maxDyRatio: number;
};

export const DEFAULT_SWIPE: SwipeConfig = {
  minDx: 0.18,
  maxMs: 450,
  maxDyRatio: 0.6,
};

export type SwipeRecognizer = {
  push(sample: SwipeSample): void;
  reset(): void;
};

/**
 * Creates a swipe recognizer.
 *
 * On the rising edge of `engaged` the origin (t, nx, ny) is recorded. While
 * engaged, each sample is checked against the origin: if the net horizontal
 * displacement clears `minDx` within `maxMs` and is not too vertical, it fires
 * once and latches until the gesture disengages. Disengaging resets the origin
 * so the next engagement starts fresh.
 */
export function createSwipeRecognizer(
  onSwipe: (dir: "swipeLeft" | "swipeRight") => void,
  config?: Partial<SwipeConfig>,
): SwipeRecognizer {
  const cfg: SwipeConfig = { ...DEFAULT_SWIPE, ...config };

  let origin: { t: number; nx: number; ny: number } | null = null;
  let fired = false;

  function reset(): void {
    origin = null;
    fired = false;
  }

  function push(sample: SwipeSample): void {
    if (!sample.engaged) {
      // Falling edge (or continued disengagement): reset for the next gesture.
      reset();
      return;
    }

    if (origin === null) {
      // Rising edge: anchor the gesture.
      origin = { t: sample.t, nx: sample.nx, ny: sample.ny };
      fired = false;
      return;
    }

    if (fired) return; // latched until disengage

    const dt = sample.t - origin.t;
    if (dt > cfg.maxMs) {
      // Window expired without a qualifying swipe. Re-anchor to this sample so a
      // slow-then-fast drag can still register a swipe from a fresh origin.
      origin = { t: sample.t, nx: sample.nx, ny: sample.ny };
      return;
    }

    const dx = sample.nx - origin.nx;
    const dy = sample.ny - origin.ny;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < cfg.minDx) return;
    if (absDy > absDx * cfg.maxDyRatio) return; // too vertical

    fired = true;
    onSwipe(dx < 0 ? "swipeLeft" : "swipeRight");
  }

  return { push, reset };
}
