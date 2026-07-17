import { describe, expect, it, vi } from "vitest";

import {
  createPinchHoldRecognizer,
  DEFAULT_PINCH_HOLD,
  type PinchHoldSample,
} from "./pinch-hold-recognizer";
import type { StudioPhaseInput } from "./types";

const HOLD = DEFAULT_PINCH_HOLD.holdMs; // 350 — the live grabHoldMs

const run = (samples: PinchHoldSample[]): StudioPhaseInput[] => {
  const events: StudioPhaseInput[] = [];
  const r = createPinchHoldRecognizer((e) => events.push(e));
  for (const s of samples) r.push(s);
  return events;
};

describe("pinch-hold recognizer (grab)", () => {
  it("emits grabStart + grabMove once the pinch clears holdMs", () => {
    expect(
      run([
        { t: 0, nx: 0.4, ny: 0.4, engaged: true }, // rising edge: time it
        { t: HOLD, nx: 0.5, ny: 0.6, engaged: true }, // dwell met
      ]),
    ).toEqual([
      { type: "grabStart" },
      { type: "grabMove", nx: 0.5, ny: 0.6 },
    ]);
  });

  it("emits nothing for a release before the threshold (that is a tap, not a grab)", () => {
    expect(
      run([
        { t: 0, nx: 0.4, ny: 0.4, engaged: true },
        { t: HOLD - 1, nx: 0.4, ny: 0.4, engaged: true },
        { t: HOLD - 1, nx: 0.4, ny: 0.4, engaged: false },
      ]),
    ).toEqual([]);
  });

  it("streams grabMove per engaged sample once grabbing", () => {
    expect(
      run([
        { t: 0, nx: 0.4, ny: 0.4, engaged: true },
        { t: HOLD, nx: 0.4, ny: 0.4, engaged: true },
        { t: HOLD + 16, nx: 0.45, ny: 0.5, engaged: true },
        { t: HOLD + 32, nx: 0.5, ny: 0.6, engaged: true },
      ]),
    ).toEqual([
      { type: "grabStart" },
      { type: "grabMove", nx: 0.4, ny: 0.4 },
      { type: "grabMove", nx: 0.45, ny: 0.5 },
      { type: "grabMove", nx: 0.5, ny: 0.6 },
    ]);
  });

  it("emits grabEnd on release, and only once", () => {
    expect(
      run([
        { t: 0, nx: 0.4, ny: 0.4, engaged: true },
        { t: HOLD, nx: 0.4, ny: 0.4, engaged: true },
        { t: HOLD + 16, nx: 0.4, ny: 0.4, engaged: false }, // release
        { t: HOLD + 32, nx: 0.4, ny: 0.4, engaged: false }, // still released
      ]),
    ).toEqual([
      { type: "grabStart" },
      { type: "grabMove", nx: 0.4, ny: 0.4 },
      { type: "grabEnd" },
    ]);
  });

  it("starts a fresh dwell on the next pinch (the clock does not carry over)", () => {
    expect(
      run([
        { t: 0, nx: 0.4, ny: 0.4, engaged: true },
        { t: 100, nx: 0.4, ny: 0.4, engaged: false }, // quick release: no grab
        { t: 200, nx: 0.4, ny: 0.4, engaged: true }, // re-pinch: clock restarts here
        { t: 200 + HOLD - 1, nx: 0.4, ny: 0.4, engaged: true }, // not yet
      ]),
    ).toEqual([]);
  });

  it("reset() mid-grab emits grabEnd so a hand-lost gap never strands a widget", () => {
    const events: StudioPhaseInput[] = [];
    const r = createPinchHoldRecognizer((e) => events.push(e));
    r.push({ t: 0, nx: 0.4, ny: 0.4, engaged: true });
    r.push({ t: HOLD, nx: 0.4, ny: 0.4, engaged: true });
    r.reset();
    expect(events.at(-1)).toEqual({ type: "grabEnd" });
  });

  it("reset() before a grab commits emits nothing", () => {
    const events: StudioPhaseInput[] = [];
    const r = createPinchHoldRecognizer((e) => events.push(e));
    r.push({ t: 0, nx: 0.4, ny: 0.4, engaged: true });
    r.reset();
    expect(events).toEqual([]);
  });

  it("honors gesture-core's grabHoldMs override", () => {
    const events: StudioPhaseInput[] = [];
    const r = createPinchHoldRecognizer((e) => events.push(e), { holdMs: 1000 });
    r.push({ t: 0, nx: 0.4, ny: 0.4, engaged: true });
    r.push({ t: HOLD, nx: 0.4, ny: 0.4, engaged: true }); // past the default, not the override
    expect(events).toEqual([]);
    r.push({ t: 1000, nx: 0.4, ny: 0.4, engaged: true });
    expect(events).toEqual([
      { type: "grabStart" },
      { type: "grabMove", nx: 0.4, ny: 0.4 },
    ]);
  });
});
