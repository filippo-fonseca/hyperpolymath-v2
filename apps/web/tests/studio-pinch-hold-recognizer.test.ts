import { describe, expect, it, vi } from "vitest";

import {
  createPinchHoldRecognizer,
  DEFAULT_PINCH_HOLD,
} from "@/lib/studio/input/pinch-hold-recognizer";
import type { StudioPhaseInput } from "@/lib/studio/input/types";

const HOLD = DEFAULT_PINCH_HOLD.holdMs;

describe("createPinchHoldRecognizer", () => {
  it("does not emit grabStart before holdMs elapses", () => {
    const cb = vi.fn();
    const rec = createPinchHoldRecognizer(cb);
    rec.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    rec.push({ t: HOLD - 1, nx: 0.5, ny: 0.5, engaged: true });
    expect(cb).not.toHaveBeenCalled();
  });

  it("emits grabStart once at the threshold, then grabMove per sample", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchHoldRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true }); // anchor
    rec.push({ t: HOLD, nx: 0.6, ny: 0.4, engaged: true }); // commits grab
    rec.push({ t: HOLD + 33, nx: 0.7, ny: 0.3, engaged: true });
    expect(got).toEqual([
      { type: "grabStart" },
      { type: "grabMove", nx: 0.6, ny: 0.4 },
      { type: "grabMove", nx: 0.7, ny: 0.3 },
    ]);
    expect(got.filter((e) => e.type === "grabStart")).toHaveLength(1);
  });

  it("release before threshold emits nothing", () => {
    const cb = vi.fn();
    const rec = createPinchHoldRecognizer(cb);
    rec.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    rec.push({ t: HOLD - 50, nx: 0.5, ny: 0.5, engaged: true });
    rec.push({ t: HOLD - 40, nx: 0.5, ny: 0.5, engaged: false }); // released early
    expect(cb).not.toHaveBeenCalled();
  });

  it("release after grabStart emits grabEnd exactly once", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchHoldRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    rec.push({ t: HOLD, nx: 0.5, ny: 0.5, engaged: true }); // grab
    rec.push({ t: HOLD + 20, nx: 0.5, ny: 0.5, engaged: false }); // release
    rec.push({ t: HOLD + 40, nx: 0.5, ny: 0.5, engaged: false }); // stays released
    expect(got.at(-1)).toEqual({ type: "grabEnd" });
    expect(got.filter((e) => e.type === "grabEnd")).toHaveLength(1);
  });

  it("re-engaging starts a fresh grab", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchHoldRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    rec.push({ t: HOLD, nx: 0.5, ny: 0.5, engaged: true }); // grab 1
    rec.push({ t: HOLD + 10, nx: 0.5, ny: 0.5, engaged: false }); // end 1
    got.length = 0;
    rec.push({ t: HOLD + 20, nx: 0.2, ny: 0.2, engaged: true }); // fresh anchor
    rec.push({ t: HOLD + 20 + HOLD, nx: 0.2, ny: 0.2, engaged: true }); // grab 2
    expect(got).toEqual([
      { type: "grabStart" },
      { type: "grabMove", nx: 0.2, ny: 0.2 },
    ]);
  });

  it("reset() mid-grab emits a terminal grabEnd; a no-grab reset is silent", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchHoldRecognizer((e) => got.push(e));
    rec.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    rec.push({ t: HOLD, nx: 0.5, ny: 0.5, engaged: true }); // grab
    got.length = 0;
    rec.reset();
    expect(got).toEqual([{ type: "grabEnd" }]);
    got.length = 0;
    rec.reset();
    expect(got).toEqual([]);
  });

  it("respects a custom holdMs", () => {
    const got: StudioPhaseInput[] = [];
    const rec = createPinchHoldRecognizer((e) => got.push(e), { holdMs: 100 });
    rec.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    rec.push({ t: 100, nx: 0.5, ny: 0.5, engaged: true });
    expect(got[0]).toEqual({ type: "grabStart" });
  });
});
