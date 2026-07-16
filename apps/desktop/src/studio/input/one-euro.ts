/**
 * 1-euro filter — an in-repo TS-strict port of Casiez, Roussel & Vogel (2012).
 *
 * Ported locally (deviation 3) rather than pulling the untyped, unmaintained
 * `1eurofilter` npm package: it is ~50 lines, keeps the dependency surface flat,
 * and is directly Vitest-tested. The filter trades a little lag for a lot of
 * jitter rejection and adapts: it smooths hard when the signal is slow (the
 * cursor sits still) and lets fast motion through (a quick flick of the finger).
 *
 * Timestamps are accepted in **milliseconds** and converted to seconds
 * internally, so callers can pass frame times directly.
 */

/** Smoothing factor for a first-order low-pass at `cutoff` Hz over `dtSec`. */
const smoothingAlpha = (cutoffHz: number, dtSec: number): number => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
};

/** A first-order exponential low-pass with explicit, per-sample alpha. */
class LowPass {
  private hasValue = false;
  private prev = 0;

  filter(value: number, alpha: number): number {
    const next = this.hasValue ? alpha * value + (1 - alpha) * this.prev : value;
    this.prev = next;
    this.hasValue = true;
    return next;
  }

  reset(): void {
    this.hasValue = false;
    this.prev = 0;
  }

  get initialized(): boolean {
    return this.hasValue;
  }
}

export type OneEuroConfig = {
  /** Minimum cutoff frequency (Hz). Lower = more smoothing at rest. */
  minCutoff: number;
  /** Speed coefficient. Higher = less lag on fast motion. */
  beta: number;
  /** Cutoff (Hz) for the derivative low-pass. */
  dCutoff: number;
};

export const DEFAULT_ONE_EURO: OneEuroConfig = {
  minCutoff: 1.0,
  beta: 0.02,
  dCutoff: 1.0,
};

export class OneEuroFilter {
  private readonly cfg: OneEuroConfig;
  private readonly xLp = new LowPass();
  private readonly dxLp = new LowPass();
  private lastTimeMs: number | null = null;
  private lastValue = 0;

  constructor(config?: Partial<OneEuroConfig>) {
    this.cfg = { ...DEFAULT_ONE_EURO, ...config };
  }

  /**
   * Filters `value` sampled at `tMs` (milliseconds). The first sample (or any
   * sample with non-positive dt) passes through unfiltered to avoid dividing by
   * a zero time delta.
   */
  filter(tMs: number, value: number): number {
    if (this.lastTimeMs === null) {
      this.lastTimeMs = tMs;
      this.lastValue = value;
      // Seed both low-passes so subsequent samples blend against this value.
      this.xLp.filter(value, 1);
      return value;
    }

    const dtSec = (tMs - this.lastTimeMs) / 1000;
    if (dtSec <= 0) {
      // No time elapsed (or clock went backwards): re-filter is meaningless, so
      // return the last smoothed value without advancing state.
      return this.xLp.filter(this.lastValue, 1);
    }

    const dx = (value - this.lastValue) / dtSec;
    const edx = this.dxLp.filter(dx, smoothingAlpha(this.cfg.dCutoff, dtSec));
    const cutoff = this.cfg.minCutoff + this.cfg.beta * Math.abs(edx);
    const smoothed = this.xLp.filter(value, smoothingAlpha(cutoff, dtSec));

    this.lastTimeMs = tMs;
    this.lastValue = value;
    return smoothed;
  }

  reset(): void {
    this.xLp.reset();
    this.dxLp.reset();
    this.lastTimeMs = null;
    this.lastValue = 0;
  }
}

/** Independent 1-euro filters over an (x, y) pair sharing one config. */
export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(config?: Partial<OneEuroConfig>) {
    this.fx = new OneEuroFilter(config);
    this.fy = new OneEuroFilter(config);
  }

  filter(tMs: number, x: number, y: number): { x: number; y: number } {
    return { x: this.fx.filter(tMs, x), y: this.fy.filter(tMs, y) };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
