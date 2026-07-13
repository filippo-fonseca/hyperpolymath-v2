import { describe, expect, it } from "vitest";

import {
  createFistScrollRecognizer,
  DEFAULT_FIST_SCROLL,
  type FistScrollSample,
} from "./fist-scroll-recognizer";
import type { StudioPhaseInput } from "./types";

function run(
  samples: FistScrollSample[],
  config?: Parameters<typeof createFistScrollRecognizer>[1],
): { events: StudioPhaseInput[]; mode: string } {
  const events: StudioPhaseInput[] = [];
  const rec = createFistScrollRecognizer((e) => events.push(e), config);
  for (const s of samples) rec.push(s);
  return { events, mode: rec.mode };
}

const ORIGIN = { nx: 0.5, ny: 0.5 };

describe("fist-scroll recognizer", () => {
  it("claims scroll on a vertical-dominant fist drag and emits scrollStart+moves", () => {
    const { events, mode } = run([
      { t: 0, ...ORIGIN, engaged: true }, // fist origin
      { t: 30, nx: 0.5, ny: 0.6, engaged: true }, // vertical drag past activateDist
      { t: 60, nx: 0.5, ny: 0.7, engaged: true }, // more vertical
      { t: 90, nx: 0.5, ny: 0.55, engaged: true }, // back up
    ]);
    expect(mode).toBe("scroll");
    expect(events[0]).toEqual({ type: "scrollStart" });
    const moves = events.filter((e) => e.type === "scrollMove");
    expect(moves.length).toBeGreaterThan(0);
    // Dragging DOWN (ny up) scrolls DOWN (positive dy); back UP is negative.
    expect((moves[0] as { dy: number }).dy).toBeGreaterThan(0);
    expect((moves.at(-1) as { dy: number }).dy).toBeLessThan(0);
  });

  it("emits scrollEnd on fist release after a scroll", () => {
    const { events } = run([
      { t: 0, ...ORIGIN, engaged: true },
      { t: 30, nx: 0.5, ny: 0.62, engaged: true }, // scroll
      { t: 60, ...ORIGIN, engaged: false }, // release
    ]);
    expect(events.at(-1)).toEqual({ type: "scrollEnd" });
  });

  it("latches swipe (never scrolls) on a lateral-dominant fist drag", () => {
    const { events, mode } = run([
      { t: 0, ...ORIGIN, engaged: true },
      { t: 30, nx: 0.62, ny: 0.5, engaged: true }, // lateral drag
      { t: 60, nx: 0.7, ny: 0.51, engaged: true }, // more lateral
    ]);
    expect(mode).toBe("swipe");
    expect(events).toEqual([]); // no scroll events at all
  });

  it("stays idle (no scroll) for a stationary fist under the activation distance", () => {
    const { events, mode } = run([
      { t: 0, ...ORIGIN, engaged: true },
      { t: 30, nx: 0.51, ny: 0.51, engaged: true }, // tiny jitter, under activateDist
      { t: 60, nx: 0.5, ny: 0.5, engaged: true },
    ]);
    expect(mode).toBe("idle");
    expect(events).toEqual([]);
  });

  it("latches the winning axis for the whole fist (scroll never flickers to swipe)", () => {
    const { events, mode } = run([
      { t: 0, ...ORIGIN, engaged: true },
      { t: 30, nx: 0.5, ny: 0.6, engaged: true }, // vertical claims scroll
      { t: 60, nx: 0.9, ny: 0.6, engaged: true }, // then a big lateral move
    ]);
    expect(mode).toBe("scroll"); // stayed scroll
    expect(events.some((e) => e.type === "scrollStart")).toBe(true);
  });

  it("does not dump the activation travel as one giant first delta", () => {
    const { events } = run([
      { t: 0, ...ORIGIN, engaged: true },
      { t: 30, nx: 0.5, ny: 0.6, engaged: true }, // activates scroll here
      { t: 60, nx: 0.5, ny: 0.61, engaged: true }, // small step after
    ]);
    const firstMove = events.find((e) => e.type === "scrollMove") as
      | { dy: number }
      | undefined;
    // The first emitted move reflects only the post-activation step (~0.01), not
    // the full 0.1 activation travel.
    if (firstMove) {
      expect(Math.abs(firstMove.dy)).toBeLessThan(
        0.05 * DEFAULT_FIST_SCROLL.pixelsPerUnit,
      );
    }
  });

  it("reset() mid-scroll emits scrollEnd", () => {
    const events: StudioPhaseInput[] = [];
    const rec = createFistScrollRecognizer((e) => events.push(e));
    rec.push({ t: 0, ...ORIGIN, engaged: true });
    rec.push({ t: 30, nx: 0.5, ny: 0.62, engaged: true }); // scroll
    rec.reset();
    expect(events.at(-1)).toEqual({ type: "scrollEnd" });
    expect(rec.mode).toBe("idle");
  });

  it("a fresh fist re-arbitrates from idle", () => {
    const rec = createFistScrollRecognizer(() => {});
    rec.push({ t: 0, ...ORIGIN, engaged: true });
    rec.push({ t: 30, nx: 0.7, ny: 0.5, engaged: true }); // swipe latch
    expect(rec.mode).toBe("swipe");
    rec.push({ t: 60, ...ORIGIN, engaged: false }); // release
    expect(rec.mode).toBe("idle");
    rec.push({ t: 90, ...ORIGIN, engaged: true }); // new fist
    rec.push({ t: 120, nx: 0.5, ny: 0.6, engaged: true }); // now vertical → scroll
    expect(rec.mode).toBe("scroll");
  });
});
