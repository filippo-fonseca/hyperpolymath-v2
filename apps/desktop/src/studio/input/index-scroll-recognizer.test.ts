import { describe, expect, it } from "vitest";

import {
  createIndexScrollRecognizer,
  DEFAULT_INDEX_SCROLL,
  type IndexScrollSample,
} from "./index-scroll-recognizer";
import type { StudioPhaseInput } from "./types";

function run(
  samples: IndexScrollSample[],
  config?: Parameters<typeof createIndexScrollRecognizer>[1],
): StudioPhaseInput[] {
  const events: StudioPhaseInput[] = [];
  const rec = createIndexScrollRecognizer((e) => events.push(e), config);
  for (const s of samples) rec.push(s);
  return events;
}

describe("index-scroll recognizer", () => {
  it("opens the lifecycle with a scrollStart on the first engaged frame", () => {
    const events = run([{ t: 0, ny: 0.5, engaged: true }]);
    expect(events).toEqual([{ type: "scrollStart" }]);
  });

  it("does not scroll on the anchor frame (no prior sample to diff)", () => {
    const events = run([
      { t: 0, ny: 0.5, engaged: true },
      // A big jump on frame 2 scrolls; frame 1 itself never emits a move.
    ]);
    expect(events.filter((e) => e.type === "scrollMove")).toEqual([]);
  });

  it("ignores slow aiming motion below the velocity deadband", () => {
    // Drift 0.02 over 100ms = 0.2 ny/s, under the 0.35 deadband: no scroll.
    const events = run([
      { t: 0, ny: 0.5, engaged: true },
      { t: 100, ny: 0.52, engaged: true },
      { t: 200, ny: 0.54, engaged: true },
    ]);
    expect(events).toEqual([{ type: "scrollStart" }]);
  });

  it("scrolls down (positive dy) on a fast downward flick", () => {
    // Move ny +0.1 over 30ms = 3.33 ny/s, well past the deadband → scroll down.
    const events = run([
      { t: 0, ny: 0.4, engaged: true },
      { t: 30, ny: 0.5, engaged: true },
    ]);
    const move = events.find((e) => e.type === "scrollMove") as {
      dy: number;
    };
    expect(move.dy).toBeGreaterThan(0);
  });

  it("scrolls up (negative dy) on a fast upward flick", () => {
    const events = run([
      { t: 0, ny: 0.6, engaged: true },
      { t: 30, ny: 0.5, engaged: true },
    ]);
    const move = events.find((e) => e.type === "scrollMove") as {
      dy: number;
    };
    expect(move.dy).toBeLessThan(0);
  });

  it("clamps a landmark-pop lurch to maxStepPx", () => {
    // A huge single-frame jump would otherwise inject a giant delta.
    const events = run([
      { t: 0, ny: 0.1, engaged: true },
      { t: 16, ny: 0.9, engaged: true },
    ]);
    const move = events.find((e) => e.type === "scrollMove") as {
      dy: number;
    };
    expect(move.dy).toBeLessThanOrEqual(DEFAULT_INDEX_SCROLL.maxStepPx);
  });

  it("ends the lifecycle with scrollEnd when the pose drops", () => {
    const events = run([
      { t: 0, ny: 0.4, engaged: true },
      { t: 30, ny: 0.5, engaged: true },
      { t: 60, ny: 0.5, engaged: false }, // pose left / hover lost
    ]);
    expect(events.at(-1)).toEqual({ type: "scrollEnd" });
  });

  it("reset() mid-scroll emits a terminal scrollEnd (hand-loss safety)", () => {
    const events: StudioPhaseInput[] = [];
    const rec = createIndexScrollRecognizer((e) => events.push(e));
    rec.push({ t: 0, ny: 0.5, engaged: true }); // scrolling
    rec.reset();
    expect(events.at(-1)).toEqual({ type: "scrollEnd" });
  });

  it("reset() before engaging emits nothing", () => {
    const events: StudioPhaseInput[] = [];
    const rec = createIndexScrollRecognizer((e) => events.push(e));
    rec.push({ t: 0, ny: 0.5, engaged: false });
    rec.reset();
    expect(events).toEqual([]);
  });
});
