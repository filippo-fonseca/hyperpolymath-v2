import { describe, expect, it } from "vitest";

import {
  DEFAULT_ONE_EURO,
  OneEuroFilter,
  OneEuroFilter2D,
} from "@/lib/studio/input/one-euro";

const variance = (xs: number[]): number => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
};

/** Feed a filter a value stream at a fixed frame interval; return the outputs. */
const run = (f: OneEuroFilter, values: number[], dtMs = 1000 / 30): number[] => {
  const out: number[] = [];
  values.forEach((v, i) => out.push(f.filter(i * dtMs, v)));
  return out;
};

describe("OneEuroFilter", () => {
  it("passes the first sample through unfiltered", () => {
    const f = new OneEuroFilter();
    expect(f.filter(0, 0.42)).toBe(0.42);
  });

  it("converges to a constant input", () => {
    const f = new OneEuroFilter();
    const out = run(f, Array(60).fill(0.7));
    expect(out.at(-1)!).toBeCloseTo(0.7, 6);
  });

  it("approaches a step monotonically and settles within epsilon", () => {
    const f = new OneEuroFilter();
    // 30 frames at 0, then a step to 1 held for 120 frames.
    const values = [...Array(30).fill(0), ...Array(120).fill(1)];
    const out = run(f, values);

    const afterStep = out.slice(30);
    // Monotonic non-decreasing approach toward the new level.
    for (let i = 1; i < afterStep.length; i++) {
      expect(afterStep[i]).toBeGreaterThanOrEqual(afterStep[i - 1]! - 1e-9);
    }
    expect(afterStep.at(-1)!).toBeCloseTo(1, 3);
    // The very first post-step output must lag (not jump straight to 1).
    expect(afterStep[0]!).toBeLessThan(1);
  });

  it("reduces variance on a jittery (noisy) input", () => {
    const f = new OneEuroFilter();
    const noisy = Array.from({ length: 200 }, (_, i) => 0.5 + 0.1 * Math.sin(i * 1.7));
    const out = run(f, noisy);
    // Compare steady-state windows (skip warm-up).
    expect(variance(out.slice(50))).toBeLessThan(variance(noisy.slice(50)));
  });

  it("lags less with a higher beta on a fast ramp", () => {
    const low = new OneEuroFilter({ beta: 0.0 });
    const high = new OneEuroFilter({ beta: 2.0 });
    const ramp = Array.from({ length: 40 }, (_, i) => i * 0.02);
    const outLow = run(low, ramp);
    const outHigh = run(high, ramp);
    // Higher beta tracks a fast-moving signal more closely (less lag), so it
    // stays nearer the true (input) value.
    const idx = 30;
    const lagLow = Math.abs(ramp[idx]! - outLow[idx]!);
    const lagHigh = Math.abs(ramp[idx]! - outHigh[idx]!);
    expect(lagHigh).toBeLessThan(lagLow);
  });

  it("handles dt <= 0 without dividing by zero", () => {
    const f = new OneEuroFilter();
    f.filter(100, 0.3);
    // Same timestamp: must not throw or produce NaN.
    const same = f.filter(100, 0.9);
    expect(Number.isFinite(same)).toBe(true);
    // Clock going backwards: still finite.
    const back = f.filter(50, 0.1);
    expect(Number.isFinite(back)).toBe(true);
  });

  it("reset() clears state so the next sample passes through", () => {
    const f = new OneEuroFilter();
    run(f, Array(20).fill(0.2));
    f.reset();
    expect(f.filter(0, 0.95)).toBe(0.95);
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_ONE_EURO).toEqual({ minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 });
  });
});

describe("OneEuroFilter2D", () => {
  it("filters x and y independently and passes first sample through", () => {
    const f = new OneEuroFilter2D();
    expect(f.filter(0, 0.1, 0.9)).toEqual({ x: 0.1, y: 0.9 });
  });

  it("converges both axes to constant inputs", () => {
    const f = new OneEuroFilter2D();
    let last = { x: 0, y: 0 };
    for (let i = 0; i < 60; i++) last = f.filter((i * 1000) / 30, 0.25, 0.75);
    expect(last.x).toBeCloseTo(0.25, 6);
    expect(last.y).toBeCloseTo(0.75, 6);
  });

  it("reset() clears both axes", () => {
    const f = new OneEuroFilter2D();
    for (let i = 0; i < 10; i++) f.filter((i * 1000) / 30, 0.4, 0.4);
    f.reset();
    expect(f.filter(0, 0.8, 0.2)).toEqual({ x: 0.8, y: 0.2 });
  });
});
