/**
 * Pinch-pull recognizer — a normalized, clamped resize scalar, a pure state
 * machine mirroring `swipe-recognizer.ts`.
 *
 * While a pinch is engaged it tracks the apparent hand size (a depth proxy the
 * caller pre-smooths — see gesture-core's palm-size filter) and emits a
 * `pullDelta` stream: `delta = clamp(ln(size / originSize) / ln 2, -maxDelta,
 * +maxDelta)`. The `ln` ratio makes grow and shrink symmetric and scale-
 * invariant; one halving/doubling of apparent size sweeps the full ±1 range.
 * A jitter deadzone suppresses no-op emissions. `pullStart`/`pullEnd` bracket
 * the stream. Downstream this becomes widget resize.
 */

import type { StudioPhaseInput } from "./types";

export type PinchPullSample = {
  t: number;
  /** Apparent hand/palm size (raw image units, > 0). Diffed against the origin. */
  size: number;
  /** True while the pinch is held. */
  engaged: boolean;
};

export type PinchPullConfig = {
  /** Minimum change in the clamped delta before a new `pullDelta` is emitted. */
  deadzone: number;
  /** The delta is clamped to ±maxDelta. */
  maxDelta: number;
};

export const DEFAULT_PINCH_PULL: PinchPullConfig = {
  deadzone: 0.02,
  maxDelta: 1,
};

export type PinchPullRecognizer = {
  push(sample: PinchPullSample): void;
  reset(): void;
};

const clampAbs = (v: number, max: number): number => (v < -max ? -max : v > max ? max : v);

/**
 * Creates a pinch-pull recognizer. Degenerate frames (`size <= 0`) are ignored.
 * Calling `reset()` mid-gesture emits `pullEnd` so a hand-lost gap never leaves a
 * consumer mid-resize.
 */
export function createPinchPullRecognizer(
  onEvent: (event: StudioPhaseInput) => void,
  config?: Partial<PinchPullConfig>,
): PinchPullRecognizer {
  const cfg: PinchPullConfig = { ...DEFAULT_PINCH_PULL, ...config };

  let originSize: number | null = null;
  let lastEmitted = 0;

  function reset(): void {
    if (originSize !== null) onEvent({ type: "pullEnd" });
    originSize = null;
    lastEmitted = 0;
  }

  function push(sample: PinchPullSample): void {
    if (!sample.engaged) {
      reset();
      return;
    }
    if (sample.size <= 0) return; // ignore degenerate frames

    if (originSize === null) {
      originSize = sample.size;
      lastEmitted = 0;
      onEvent({ type: "pullStart" });
      onEvent({ type: "pullDelta", delta: 0 });
      return;
    }

    const raw = Math.log(sample.size / originSize) / Math.LN2;
    const delta = clampAbs(raw, cfg.maxDelta);
    if (Math.abs(delta - lastEmitted) >= cfg.deadzone) {
      lastEmitted = delta;
      onEvent({ type: "pullDelta", delta });
    }
  }

  return { push, reset };
}
