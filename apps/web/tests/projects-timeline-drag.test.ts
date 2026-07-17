/**
 * Projects timeline drag logic (u4-timeline-drag / sesh-1784257742502).
 *
 * The Conductor's trap #3: snap / commit-patch / cancel / threshold /
 * archive-trap are unit tests, not browser theater. Everything here exercises
 * the PURE `drag-plan` module — the imperative pointer session in
 * `useTimelineDrag` is only glue over these decisions.
 *
 * Dates are built from a fixed anchor with the engine's own ISO helpers, so the
 * suite is timezone- and clock-independent (the engine proved that property).
 */

import { describe, expect, it } from "vitest";

import {
  AUTOSCROLL_EDGE_PX,
  AUTOSCROLL_MAX_VEL_PX,
  autoScrollVelocity,
  crossedThreshold,
  DRAG_THRESHOLD_PX,
  isNoopPatch,
  patchWouldArchive,
  planDrag,
  previewGeometry,
} from "@/components/projects/timeline/drag-plan";
import { addDaysISO, MIN_BAR_WIDTH_PX } from "@/lib/projects/timeline";

const ANCHOR = "2026-03-01";
const START = ANCHOR; // 2026-03-01
const END = addDaysISO(ANCHOR, 30); // 2026-03-31
const WINDOW_END = addDaysISO(ANCHOR, 90); // where an open terminus sits

describe("planDrag — move", () => {
  it("shifts both edges by the snapped delta on a bounded bar", () => {
    const patch = planDrag({
      mode: "move",
      dayDelta: 7,
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: END,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBe(addDaysISO(START, 7));
    expect(patch.endDate).toBe(addDaysISO(END, 7));
  });

  it("shifts left with a negative delta", () => {
    const patch = planDrag({
      mode: "move",
      dayDelta: -5,
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: END,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBe(addDaysISO(START, -5));
    expect(patch.endDate).toBe(addDaysISO(END, -5));
  });

  it("keeps an open-ended bar open — only the start becomes explicit", () => {
    const patch = planDrag({
      mode: "move",
      dayDelta: 10,
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: null,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBe(addDaysISO(START, 10));
    expect(patch.endDate).toBeNull();
  });

  it("schedules an undated project from its effective start anchor", () => {
    // rawStart null (undated) but the bar renders from an effective anchor;
    // dragging the whole bar makes that anchor a real, moved start.
    const patch = planDrag({
      mode: "move",
      dayDelta: 3,
      rawStartISO: null,
      effectiveStartISO: START,
      rawEndISO: null,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBe(addDaysISO(START, 3));
    expect(patch.endDate).toBeNull();
  });
});

describe("planDrag — resize-start", () => {
  it("moves the start edge only, preserving the end", () => {
    const patch = planDrag({
      mode: "resize-start",
      dayDelta: 4,
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: END,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBe(addDaysISO(START, 4));
    expect(patch.endDate).toBe(END);
  });

  it("clamps the start to a bounded end rather than inverting the bar", () => {
    const patch = planDrag({
      mode: "resize-start",
      dayDelta: 100, // way past the end
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: END,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBe(END);
    expect(patch.endDate).toBe(END);
  });

  it("keeps an open end open while dragging the start", () => {
    const patch = planDrag({
      mode: "resize-start",
      dayDelta: 8,
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: null,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBe(addDaysISO(START, 8));
    expect(patch.endDate).toBeNull();
  });
});

describe("planDrag — resize-end", () => {
  it("moves the end edge only, preserving the start", () => {
    const patch = planDrag({
      mode: "resize-end",
      dayDelta: 6,
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: END,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBe(START);
    expect(patch.endDate).toBe(addDaysISO(END, 6));
  });

  it("preserves a null start when resizing the end of an undated bar", () => {
    const patch = planDrag({
      mode: "resize-end",
      dayDelta: 2,
      rawStartISO: null,
      effectiveStartISO: START,
      rawEndISO: END,
      windowEndISO: WINDOW_END,
    });
    expect(patch.startDate).toBeNull();
    expect(patch.endDate).toBe(addDaysISO(END, 2));
  });

  it("converts an open-ended terminus to a real end date at the snapped position", () => {
    // The open terminus sits at WINDOW_END; dragging it in (negative) lands a
    // real end date earlier than the window edge.
    const patch = planDrag({
      mode: "resize-end",
      dayDelta: -20,
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: null,
      windowEndISO: WINDOW_END,
    });
    expect(patch.endDate).toBe(addDaysISO(WINDOW_END, -20));
    expect(patch.endDate).not.toBeNull();
    expect(patch.startDate).toBe(START);
  });

  it("clamps the end to the start rather than dragging it before the bar begins", () => {
    const patch = planDrag({
      mode: "resize-end",
      dayDelta: -1000,
      rawStartISO: START,
      effectiveStartISO: START,
      rawEndISO: END,
      windowEndISO: WINDOW_END,
    });
    expect(patch.endDate).toBe(START);
  });
});

describe("isNoopPatch", () => {
  const project = { startDate: START, endDate: END };

  it("is true when the patch matches the current dates", () => {
    expect(isNoopPatch({ startDate: START, endDate: END }, project)).toBe(true);
  });

  it("is false when a date changed", () => {
    expect(isNoopPatch({ startDate: addDaysISO(START, 1), endDate: END }, project)).toBe(false);
  });

  it("treats a missing project date as null", () => {
    expect(isNoopPatch({ startDate: null, endDate: null }, { startDate: null, endDate: null })).toBe(
      true,
    );
    expect(isNoopPatch({ startDate: START, endDate: null }, { startDate: null, endDate: null })).toBe(
      false,
    );
  });
});

describe("patchWouldArchive", () => {
  const today = "2026-06-15";
  // A live, bounded project ending in the future.
  const live = {
    isClass: false,
    endDate: addDaysISO(today, 30),
    semesterTerm: null,
    semesterYear: null,
  };

  it("flags a drag that pushes the end into the past", () => {
    const patch = { startDate: START, endDate: addDaysISO(today, -1) };
    expect(patchWouldArchive(live, patch, today)).toBe(true);
  });

  it("does not flag a drag that keeps the end in the future", () => {
    const patch = { startDate: START, endDate: addDaysISO(today, 5) };
    expect(patchWouldArchive(live, patch, today)).toBe(false);
  });

  it("does not re-flag an already-expired project", () => {
    const expired = { ...live, endDate: addDaysISO(today, -10) };
    const patch = { startDate: START, endDate: addDaysISO(today, -3) };
    expect(patchWouldArchive(expired, patch, today)).toBe(false);
  });

  it("does not flag an inverted patch (that is a different warning)", () => {
    const patch = { startDate: addDaysISO(today, 5), endDate: addDaysISO(today, -5) };
    expect(patchWouldArchive(live, patch, today)).toBe(false);
  });

  it("never flags an open-ended result", () => {
    const patch = { startDate: START, endDate: null };
    expect(patchWouldArchive(live, patch, today)).toBe(false);
  });
});

describe("crossedThreshold", () => {
  it("is below threshold for tiny travel", () => {
    expect(crossedThreshold(DRAG_THRESHOLD_PX - 1)).toBe(false);
    expect(crossedThreshold(0)).toBe(false);
  });

  it("crosses at the threshold in either direction", () => {
    expect(crossedThreshold(DRAG_THRESHOLD_PX)).toBe(true);
    expect(crossedThreshold(-DRAG_THRESHOLD_PX)).toBe(true);
    expect(crossedThreshold(50)).toBe(true);
  });
});

describe("previewGeometry", () => {
  const base = { leftPx: 100, widthPx: 60 };

  it("translates the whole bar on move", () => {
    expect(previewGeometry(base, 24, "move")).toEqual({ leftPx: 124, widthPx: 60 });
  });

  it("moves the left edge and shrinks width on resize-start", () => {
    expect(previewGeometry(base, 16, "resize-start")).toEqual({ leftPx: 116, widthPx: 44 });
  });

  it("clamps resize-start to the min width and pins to the right edge", () => {
    const out = previewGeometry(base, 100, "resize-start", MIN_BAR_WIDTH_PX);
    expect(out.widthPx).toBe(MIN_BAR_WIDTH_PX);
    // right edge (base.left + base.width) stays put: 100 + 60 = 160
    expect(out.leftPx + out.widthPx).toBe(160);
  });

  it("grows width on resize-end, left edge fixed", () => {
    expect(previewGeometry(base, 20, "resize-end")).toEqual({ leftPx: 100, widthPx: 80 });
  });

  it("clamps resize-end to the min width", () => {
    const out = previewGeometry(base, -1000, "resize-end", MIN_BAR_WIDTH_PX);
    expect(out).toEqual({ leftPx: 100, widthPx: MIN_BAR_WIDTH_PX });
  });
});

describe("autoScrollVelocity", () => {
  // A scroller spanning clientX 0..1000.
  const LEFT = 0;
  const RIGHT = 1000;

  it("is zero in the calm middle", () => {
    expect(autoScrollVelocity(500, LEFT, RIGHT)).toBe(0);
  });

  it("pulls left (negative) near the left edge", () => {
    expect(autoScrollVelocity(LEFT + 5, LEFT, RIGHT)).toBeLessThan(0);
  });

  it("pushes right (positive) near the right edge", () => {
    expect(autoScrollVelocity(RIGHT - 5, LEFT, RIGHT)).toBeGreaterThan(0);
  });

  it("accelerates as the pointer nears the wall", () => {
    const far = Math.abs(autoScrollVelocity(LEFT + AUTOSCROLL_EDGE_PX - 1, LEFT, RIGHT));
    const near = Math.abs(autoScrollVelocity(LEFT + 1, LEFT, RIGHT));
    expect(near).toBeGreaterThan(far);
  });

  it("saturates at the max velocity past the edge", () => {
    expect(autoScrollVelocity(RIGHT + 200, LEFT, RIGHT)).toBe(AUTOSCROLL_MAX_VEL_PX);
    expect(autoScrollVelocity(LEFT - 200, LEFT, RIGHT)).toBe(-AUTOSCROLL_MAX_VEL_PX);
  });
});
