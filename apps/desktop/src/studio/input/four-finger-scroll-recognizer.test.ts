import { describe, expect, it } from "vitest";

import {
  createFourFingerScrollRecognizer,
  DEFAULT_FOUR_FINGER_SCROLL,
  type FourFingerScrollSample,
} from "./four-finger-scroll-recognizer";
import type { StudioPhaseInput } from "./types";

function run(
  samples: FourFingerScrollSample[],
  config?: Parameters<typeof createFourFingerScrollRecognizer>[1],
): StudioPhaseInput[] {
  const events: StudioPhaseInput[] = [];
  const rec = createFourFingerScrollRecognizer((e) => events.push(e), config);
  for (const s of samples) rec.push(s);
  return events;
}

describe("four-finger-curl scroll recognizer", () => {
  it("opens the lifecycle with a scrollStart on the first engaged frame", () => {
    const events = run([{ t: 0, openness: 1.8, engaged: true }]);
    expect(events).toEqual([{ type: "scrollStart" }]);
  });

  it("does not scroll on the anchor frame (no prior sample to diff)", () => {
    const events = run([{ t: 0, openness: 1.8, engaged: true }]);
    expect(events.filter((e) => e.type === "scrollMove")).toEqual([]);
  });

  it("ignores a slow openness drift below the velocity deadband", () => {
    // Drift 0.02 over 100ms = 0.2 units/s, under the 0.9 deadband: no scroll.
    const events = run([
      { t: 0, openness: 1.8, engaged: true },
      { t: 100, openness: 1.78, engaged: true },
      { t: 200, openness: 1.76, engaged: true },
    ]);
    expect(events).toEqual([{ type: "scrollStart" }]);
  });

  it("scrolls down (positive dy) on a fast finger CURL (openness drops)", () => {
    // Openness −0.2 over 30ms = 6.7 units/s, past the deadband → scroll down.
    const events = run([
      { t: 0, openness: 1.9, engaged: true },
      { t: 30, openness: 1.7, engaged: true },
    ]);
    const move = events.find((e) => e.type === "scrollMove") as { dy: number };
    expect(move.dy).toBeGreaterThan(0);
  });

  it("scrolls up (negative dy) on a fast UNCURL (openness rises)", () => {
    const events = run([
      { t: 0, openness: 1.7, engaged: true },
      { t: 30, openness: 1.9, engaged: true },
    ]);
    const move = events.find((e) => e.type === "scrollMove") as { dy: number };
    expect(move.dy).toBeLessThan(0);
  });

  it("clamps a landmark-pop lurch to maxStepPx", () => {
    const events = run([
      { t: 0, openness: 1.0, engaged: true },
      { t: 16, openness: 2.1, engaged: true },
    ]);
    const move = events.find((e) => e.type === "scrollMove") as { dy: number };
    expect(Math.abs(move.dy)).toBeLessThanOrEqual(DEFAULT_FOUR_FINGER_SCROLL.maxStepPx);
  });

  it("ends the lifecycle with scrollEnd when the pose drops", () => {
    const events = run([
      { t: 0, openness: 1.9, engaged: true },
      { t: 30, openness: 1.7, engaged: true },
      { t: 60, openness: 1.7, engaged: false },
    ]);
    expect(events.at(-1)).toEqual({ type: "scrollEnd" });
  });

  it("reset() mid-scroll emits a terminal scrollEnd (hand-loss safety)", () => {
    const events: StudioPhaseInput[] = [];
    const rec = createFourFingerScrollRecognizer((e) => events.push(e));
    rec.push({ t: 0, openness: 1.8, engaged: true });
    rec.reset();
    expect(events.at(-1)).toEqual({ type: "scrollEnd" });
  });

  it("reset() before engaging emits nothing", () => {
    const events: StudioPhaseInput[] = [];
    const rec = createFourFingerScrollRecognizer((e) => events.push(e));
    rec.push({ t: 0, openness: 1.8, engaged: false });
    rec.reset();
    expect(events).toEqual([]);
  });
});
