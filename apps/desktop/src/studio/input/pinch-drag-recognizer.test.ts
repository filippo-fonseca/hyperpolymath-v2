import { describe, expect, it } from "vitest";

import {
  createPinchDragRecognizer,
  type PinchDragSample,
} from "./pinch-drag-recognizer";
import type { StudioPhaseInput } from "./types";

const run = (samples: PinchDragSample[]): StudioPhaseInput[] => {
  const events: StudioPhaseInput[] = [];
  const r = createPinchDragRecognizer((e) => events.push(e));
  for (const s of samples) r.push(s);
  return events;
};

describe("pinch-drag recognizer (camera pan)", () => {
  it("opens the lifecycle at zero on the rising edge (no lurch at drag start)", () => {
    expect(run([{ t: 0, nx: 0.7, ny: 0.3, depth: 0.5, engaged: true }])).toEqual([
      { type: "dragStart" },
      { type: "dragMove", dx: 0, dy: 0, dz: 0 },
    ]);
  });

  it("emits deltas CUMULATIVE from the origin, not incremental", () => {
    const events = run([
      { t: 0, nx: 0.5, ny: 0.5, depth: 0, engaged: true },
      { t: 16, nx: 0.6, ny: 0.4, depth: 0.1, engaged: true },
      { t: 32, nx: 0.7, ny: 0.3, depth: 0.2, engaged: true },
    ]);
    const moves = events.filter((e) => e.type === "dragMove");
    expect(moves).toHaveLength(3);
    // The LAST sample reads its full displacement from the ORIGIN (0.2), not the
    // 0.1 it travelled since its predecessor. That is the whole contract.
    expect(moves.at(-1)).toMatchObject({
      dx: expect.closeTo(0.2, 6),
      dy: expect.closeTo(-0.2, 6),
      dz: expect.closeTo(0.2, 6),
    });
    expect(moves[1]).toMatchObject({
      dx: expect.closeTo(0.1, 6),
      dy: expect.closeTo(-0.1, 6),
      dz: expect.closeTo(0.1, 6),
    });
  });

  it("passes the depth scalar through as dz, diffed against the engage origin", () => {
    // pinch-dolly hands in an ABSOLUTE z; the origin diff is what makes it relative.
    const events = run([
      { t: 0, nx: 0.5, ny: 0.5, depth: 0.4, engaged: true }, // engage at a non-zero z
      { t: 16, nx: 0.5, ny: 0.5, depth: 0.4, engaged: true },
      { t: 32, nx: 0.5, ny: 0.5, depth: 0.9, engaged: true },
    ]);
    const moves = events.filter((e) => e.type === "dragMove");
    expect(moves[1]).toMatchObject({ dz: 0 }); // same depth ⇒ no dolly
    expect(moves.at(-1)).toMatchObject({ dz: expect.closeTo(0.5, 6) }); // 0.9 − 0.4
  });

  it("emits dragEnd on release, and only once", () => {
    expect(
      run([
        { t: 0, nx: 0.5, ny: 0.5, depth: 0, engaged: true },
        { t: 16, nx: 0.5, ny: 0.5, depth: 0, engaged: false },
        { t: 32, nx: 0.5, ny: 0.5, depth: 0, engaged: false },
      ]),
    ).toEqual([
      { type: "dragStart" },
      { type: "dragMove", dx: 0, dy: 0, dz: 0 },
      { type: "dragEnd" },
    ]);
  });

  it("never emits while disengaged", () => {
    expect(run([{ t: 0, nx: 0.5, ny: 0.5, depth: 0, engaged: false }])).toEqual([]);
  });

  it("re-anchors the origin on the next pinch", () => {
    const events = run([
      { t: 0, nx: 0.2, ny: 0.2, depth: 0, engaged: true },
      { t: 16, nx: 0.2, ny: 0.2, depth: 0, engaged: false }, // release
      { t: 32, nx: 0.8, ny: 0.8, depth: 0, engaged: true }, // re-pinch far away
    ]);
    // The new drag starts at zero: the hand's jump between pinches is not a pan.
    expect(events.at(-1)).toEqual({ type: "dragMove", dx: 0, dy: 0, dz: 0 });
  });

  it("reset() mid-drag emits dragEnd so a hand-lost gap never strands the camera", () => {
    const events: StudioPhaseInput[] = [];
    const r = createPinchDragRecognizer((e) => events.push(e));
    r.push({ t: 0, nx: 0.5, ny: 0.5, depth: 0, engaged: true });
    r.reset();
    expect(events.at(-1)).toEqual({ type: "dragEnd" });
    r.reset(); // idempotent: no second dragEnd
    expect(events.filter((e) => e.type === "dragEnd")).toHaveLength(1);
  });
});
