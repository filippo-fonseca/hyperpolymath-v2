import { describe, expect, it, vi } from "vitest";

import { createPinchDragRecognizer } from "@/lib/studio/input/pinch-drag-recognizer";
import type { StudioPhaseInput } from "@/lib/studio/input/types";

describe("createPinchDragRecognizer", () => {
  it("emits dragStart + a zero dragMove on the rising edge", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchDragRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.4, ny: 0.5, depth: 1.0, engaged: true });
    expect(got).toEqual([
      { type: "dragStart" },
      { type: "dragMove", dx: 0, dy: 0, dz: 0 },
    ]);
  });

  it("emits cumulative deltas from the origin on each engaged sample", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchDragRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.4, ny: 0.5, depth: 1.0, engaged: true }); // origin
    rec.push({ t: 33, nx: 0.5, ny: 0.5, depth: 1.2, engaged: true });
    rec.push({ t: 66, nx: 0.7, ny: 0.3, depth: 0.8, engaged: true });
    expect(got.slice(2)).toEqual([
      { type: "dragMove", dx: expect.closeTo(0.1, 6), dy: 0, dz: expect.closeTo(0.2, 6) },
      // cumulative from origin, not from the previous sample:
      { type: "dragMove", dx: expect.closeTo(0.3, 6), dy: expect.closeTo(-0.2, 6), dz: expect.closeTo(-0.2, 6) },
    ]);
  });

  it("emits dragEnd on the falling edge, once", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchDragRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.4, ny: 0.5, depth: 1.0, engaged: true });
    rec.push({ t: 33, nx: 0.5, ny: 0.5, depth: 1.0, engaged: false });
    rec.push({ t: 66, nx: 0.5, ny: 0.5, depth: 1.0, engaged: false });
    expect(got.at(-1)).toEqual({ type: "dragEnd" });
    expect(got.filter((e) => e.type === "dragEnd")).toHaveLength(1);
  });

  it("emits nothing when never engaged", () => {
    const cb = vi.fn();
    const rec = createPinchDragRecognizer(cb);
    rec.push({ t: 0, nx: 0.4, ny: 0.5, depth: 1.0, engaged: false });
    rec.push({ t: 33, nx: 0.5, ny: 0.5, depth: 1.0, engaged: false });
    expect(cb).not.toHaveBeenCalled();
  });

  it("reset() mid-gesture emits a terminal dragEnd", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchDragRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.4, ny: 0.5, depth: 1.0, engaged: true });
    rec.reset();
    expect(got.at(-1)).toEqual({ type: "dragEnd" });
    // A second reset with no active gesture is a no-op.
    got.length = 0;
    rec.reset();
    expect(got).toEqual([]);
  });

  it("re-engaging after a release starts a fresh origin", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchDragRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.4, ny: 0.5, depth: 1.0, engaged: true });
    rec.push({ t: 33, nx: 0.6, ny: 0.5, depth: 1.0, engaged: false }); // release
    got.length = 0;
    rec.push({ t: 66, nx: 0.6, ny: 0.5, depth: 2.0, engaged: true }); // new origin here
    rec.push({ t: 99, nx: 0.7, ny: 0.5, depth: 2.0, engaged: true });
    expect(got).toEqual([
      { type: "dragStart" },
      { type: "dragMove", dx: 0, dy: 0, dz: 0 },
      { type: "dragMove", dx: expect.closeTo(0.1, 6), dy: 0, dz: 0 },
    ]);
  });
});
