import { describe, expect, it } from "vitest";

import { createCursorHistory } from "./gesture-core";

describe("createCursorHistory", () => {
  it("returns null while empty", () => {
    const h = createCursorHistory(200);
    expect(h.sampleBefore(100, 110)).toBeNull();
  });

  it("recovers the aim from ~leadMs before the query", () => {
    const h = createCursorHistory(300);
    // A hand aiming at 0.2 that then drifts to 0.5 over ~120ms.
    h.push(0, 0.2, 0.2);
    h.push(30, 0.25, 0.25);
    h.push(60, 0.32, 0.32);
    h.push(90, 0.42, 0.42);
    h.push(120, 0.5, 0.5); // "now" — pinch engages here
    // Looking back 110ms from t=120 → t=10 → nearest at/before is the t=0 sample.
    const aim = h.sampleBefore(120, 110);
    expect(aim).not.toBeNull();
    expect(aim!.nx).toBeCloseTo(0.2, 5);
    expect(aim!.ny).toBeCloseTo(0.2, 5);
  });

  it("picks the sample at or before the lookback target (not after)", () => {
    const h = createCursorHistory(300);
    h.push(0, 0.1, 0.1);
    h.push(50, 0.2, 0.2);
    h.push(100, 0.3, 0.3);
    // Lookback 40ms from t=100 → t=60 → at/before is the t=50 sample.
    const aim = h.sampleBefore(100, 40);
    expect(aim!.nx).toBeCloseTo(0.2, 5);
  });

  it("falls back to the oldest retained sample when the lookback predates history", () => {
    const h = createCursorHistory(300);
    h.push(200, 0.4, 0.4);
    h.push(210, 0.41, 0.41);
    // Lookback 500ms → t=-290, older than everything → oldest retained sample.
    const aim = h.sampleBefore(210, 500);
    expect(aim!.nx).toBeCloseTo(0.4, 5);
  });

  it("evicts samples older than the retention window (keeps one straddling)", () => {
    const h = createCursorHistory(100);
    h.push(0, 0.1, 0.1); // will be evicted (well past the window on the t=300 push)
    h.push(50, 0.2, 0.2); // straddles cutoff (200) → retained as the boundary
    h.push(300, 0.9, 0.9);
    // The stale t=0 sample is gone; a long lookback falls back to the oldest
    // RETAINED sample (t=50 = 0.2), never the evicted t=0 (0.1).
    const aim = h.sampleBefore(300, 500);
    expect(aim!.nx).toBeCloseTo(0.2, 5);
  });

  it("reset clears the buffer", () => {
    const h = createCursorHistory(200);
    h.push(0, 0.3, 0.3);
    h.reset();
    expect(h.sampleBefore(0, 0)).toBeNull();
  });
});
