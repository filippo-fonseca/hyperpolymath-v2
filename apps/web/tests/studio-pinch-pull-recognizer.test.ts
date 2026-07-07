import { describe, expect, it, vi } from "vitest";

import { createPinchPullRecognizer } from "@/lib/studio/input/pinch-pull-recognizer";
import type { StudioPhaseInput } from "@/lib/studio/input/types";

/** Pull only the numeric deltas out of the emitted phase stream. */
function deltas(events: StudioPhaseInput[]): number[] {
  return events.filter((e) => e.type === "pullDelta").map((e) => (e as { delta: number }).delta);
}

describe("createPinchPullRecognizer", () => {
  it("emits pullStart + a zero delta on the rising edge", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchPullRecognizer((e) => got.push(e));
    rec.push({ t: 0, size: 0.2, engaged: true });
    expect(got).toEqual([{ type: "pullStart" }, { type: "pullDelta", delta: 0 }]);
  });

  it("growing the hand yields positive deltas (doubling ≈ +1)", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchPullRecognizer((e) => got.push(e));
    rec.push({ t: 0, size: 0.2, engaged: true }); // origin
    rec.push({ t: 33, size: 0.28, engaged: true });
    rec.push({ t: 66, size: 0.4, engaged: true }); // 2x origin → +1
    const d = deltas(got);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeGreaterThan(0);
    expect(d.at(-1)).toBeCloseTo(1, 6);
  });

  it("shrinking the hand yields negative deltas (halving ≈ -1)", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchPullRecognizer((e) => got.push(e));
    rec.push({ t: 0, size: 0.4, engaged: true }); // origin
    rec.push({ t: 33, size: 0.2, engaged: true }); // 0.5x origin → -1
    expect(deltas(got).at(-1)).toBeCloseTo(-1, 6);
  });

  it("clamps beyond ±maxDelta", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchPullRecognizer((e) => got.push(e));
    rec.push({ t: 0, size: 0.1, engaged: true }); // origin
    rec.push({ t: 33, size: 0.8, engaged: true }); // 8x → ln2(8)=3 → clamp +1
    rec.push({ t: 66, size: 0.01, engaged: true }); // 0.1x → clamp -1
    const d = deltas(got);
    expect(d).toContain(1);
    expect(d.at(-1)).toBe(-1);
  });

  it("deadzone suppresses jitter below the threshold", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchPullRecognizer((e) => got.push(e), { deadzone: 0.1 });
    rec.push({ t: 0, size: 0.2, engaged: true }); // pullStart + delta 0
    // A tiny size wobble → ln2 change < 0.1 → no new delta emitted.
    rec.push({ t: 33, size: 0.203, engaged: true });
    rec.push({ t: 66, size: 0.204, engaged: true });
    expect(deltas(got)).toEqual([0]);
  });

  it("emits pullEnd on release, once; ignores degenerate size frames", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchPullRecognizer((e) => got.push(e));
    rec.push({ t: 0, size: 0, engaged: true }); // degenerate → ignored, no start
    expect(got).toEqual([]);
    rec.push({ t: 10, size: 0.2, engaged: true }); // now starts
    rec.push({ t: 20, size: 0.2, engaged: false }); // release
    rec.push({ t: 30, size: 0.2, engaged: false });
    expect(got.at(-1)).toEqual({ type: "pullEnd" });
    expect(got.filter((e) => e.type === "pullEnd")).toHaveLength(1);
  });

  it("emits nothing when never engaged", () => {
    const cb = vi.fn();
    const rec = createPinchPullRecognizer(cb);
    rec.push({ t: 0, size: 0.2, engaged: false });
    expect(cb).not.toHaveBeenCalled();
  });

  it("reset() mid-gesture emits a terminal pullEnd", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchPullRecognizer((e) => got.push(e));
    rec.push({ t: 0, size: 0.2, engaged: true });
    got.length = 0;
    rec.reset();
    expect(got).toEqual([{ type: "pullEnd" }]);
    got.length = 0;
    rec.reset();
    expect(got).toEqual([]);
  });
});
