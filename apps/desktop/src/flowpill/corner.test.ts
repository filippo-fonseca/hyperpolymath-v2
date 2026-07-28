import { describe, expect, it } from "vitest";

import {
  DEFAULT_CORNER,
  isCorner,
  nearestCorner,
  pillAnchor,
  type Rect,
} from "./corner";
import type { FlowPillCorner } from "./types";

/** A 1440x900 primary display at the desktop origin. */
const PRIMARY: Rect = { x: 0, y: 0, width: 1440, height: 900 };

/** The overlay window, sized as u0 creates it. */
const WINDOW = { width: 440, height: 300 };

/** The window rect with its top-left at (x, y). */
function at(x: number, y: number): Rect {
  return { x, y, ...WINDOW };
}

describe("nearestCorner", () => {
  it("resolves each quadrant of the primary display", () => {
    const cases: Array<[Rect, FlowPillCorner]> = [
      [at(24, 24), "top-left"],
      [at(1440 - 440 - 24, 24), "top-right"],
      [at(24, 900 - 300 - 24), "bottom-left"],
      [at(1440 - 440 - 24, 900 - 300 - 24), "bottom-right"],
    ];
    for (const [rect, expected] of cases) {
      expect(nearestCorner(rect, PRIMARY)).toBe(expected);
    }
  });

  it("decides on the window centre, not its origin", () => {
    // Origin is left of the midline, but 440px of window puts the centre right
    // of it. The pill visually reads as right-hand, so right is the answer.
    const straddling = at(1440 / 2 - 100, 40);
    expect(straddling.x).toBeLessThan(720);
    expect(nearestCorner(straddling, PRIMARY)).toBe("top-right");
  });

  it("breaks a dead-centre tie towards the default corner", () => {
    const centred = at(1440 / 2 - 220, 900 / 2 - 150);
    expect(nearestCorner(centred, PRIMARY)).toBe("bottom-right");
    expect(nearestCorner(centred, PRIMARY)).toBe(DEFAULT_CORNER);
  });

  it("works on a monitor left of the primary, where coordinates go negative", () => {
    const secondary: Rect = { x: -1920, y: -200, width: 1920, height: 1080 };
    expect(nearestCorner(at(-1900, -180), secondary)).toBe("top-left");
    expect(nearestCorner(at(-500, 600), secondary)).toBe("bottom-right");
    expect(nearestCorner(at(-1900, 600), secondary)).toBe("bottom-left");
    expect(nearestCorner(at(-500, -180), secondary)).toBe("top-right");
  });

  it("does not confuse a second monitor's corners with the primary's", () => {
    const right: Rect = { x: 1440, y: 0, width: 2560, height: 1440 };
    const parked = at(1440 + 40, 40);
    // Bottom-right of the primary in absolute terms, top-left of its own screen.
    expect(nearestCorner(parked, PRIMARY)).toBe("top-right");
    expect(nearestCorner(parked, right)).toBe("top-left");
  });

  it("handles a scaled retina rect without special-casing it", () => {
    const retina: Rect = { x: 0, y: 0, width: 3024, height: 1964 };
    expect(nearestCorner({ x: 2400, y: 1500, ...WINDOW }, retina)).toBe(
      "bottom-right",
    );
    expect(nearestCorner({ x: 60, y: 60, ...WINDOW }, retina)).toBe("top-left");
  });
});

describe("isCorner", () => {
  it("accepts the four corners and nothing else", () => {
    for (const corner of [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ]) {
      expect(isCorner(corner)).toBe(true);
    }
    for (const value of ["centre", "", null, undefined, 0, {}, ["top-left"]]) {
      expect(isCorner(value)).toBe(false);
    }
  });
});

describe("pillAnchor", () => {
  it("hangs the pill off the bottom edge in the bottom corners", () => {
    expect(pillAnchor("bottom-left")).toBe("bottom");
    expect(pillAnchor("bottom-right")).toBe("bottom");
  });

  it("flips to the top edge up top, so the pill does not drift inward", () => {
    expect(pillAnchor("top-left")).toBe("top");
    expect(pillAnchor("top-right")).toBe("top");
  });
});
