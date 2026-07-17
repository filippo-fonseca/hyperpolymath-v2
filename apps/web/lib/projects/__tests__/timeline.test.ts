import {
  MAX_WINDOW_DAYS,
  MIN_BAR_WIDTH_PX,
  type TimelineAreaInput,
  type TimelineProjectInput,
  type TimelineWindow,
  ZOOM_PX_PER_DAY,
  addDaysISO,
  addMonthsISO,
  barGeometry,
  columnsForWindow,
  computeWindow,
  diffDaysISO,
  endOfMonthISO,
  endOfQuarterISO,
  epochDayToISO,
  groupByArea,
  headerGroupsForWindow,
  isProjectGhost,
  isSentinelArea,
  isoDateToPx,
  isoToEpochDay,
  markCurrentColumn,
  projectEffectiveStartISO,
  pxToISODate,
  pxToSnappedDayDelta,
  snapISO,
  startOfQuarterISO,
  startOfWeekISO,
  toDateISO,
  todayOffsetPx,
  weekdayIndexISO,
} from "@/lib/projects/timeline";
/**
 * The timeline engine is a contract: the timeline UI and its drag layer are
 * built entirely on these exports, so these tests pin the shapes as much as the
 * values.
 *
 * The recurring theme is that dates never round-trip through `new Date(str)`.
 * `TZ` is deliberately left alone — every assertion here must hold in any
 * timezone, and `vitest.setup.ts` does not pin one. Run this suite with
 * `TZ=Pacific/Kiritimati` (UTC+14) or `TZ=Pacific/Midway` (UTC-11) and it must
 * stay green; that is the whole point of the ISO-string rule.
 */
import { describe, expect, it, vi } from "vitest";

const TODAY = "2026-07-16"; // a Thursday

function project(over: Partial<TimelineProjectInput> = {}): TimelineProjectInput {
  return {
    id: "p1",
    name: "Project",
    icon: null,
    areaId: "a1",
    startDate: null,
    endDate: null,
    createdAt: "2026-07-01T12:00:00.000Z",
    archivedAt: null,
    isClass: false,
    semesterTerm: null,
    semesterYear: null,
    orderIndex: 0,
    ...over,
  };
}

function area(over: Partial<TimelineAreaInput> = {}): TimelineAreaInput {
  return {
    id: "a1",
    name: "Area",
    emoji: "📁",
    orderIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** A window with round numbers, so geometry assertions read as arithmetic. */
function windowOf(startISO: string, endISO: string, pxPerDay = 10): TimelineWindow {
  return {
    startISO,
    endISO,
    pxPerDay,
    totalWidthPx: (diffDaysISO(startISO, endISO) + 1) * pxPerDay,
  };
}

// ---------------------------------------------------------------------------
// ISO date arithmetic
// ---------------------------------------------------------------------------

describe("ISO date arithmetic", () => {
  it("round-trips a date through epoch days", () => {
    expect(isoToEpochDay("1970-01-01")).toBe(0);
    expect(epochDayToISO(0)).toBe("1970-01-01");
    expect(epochDayToISO(isoToEpochDay(TODAY))).toBe(TODAY);
  });

  it("crosses month, year, and leap boundaries", () => {
    expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01"); // non-leap
  });

  it("diffs dates in whole signed days", () => {
    expect(diffDaysISO("2026-07-16", "2026-07-16")).toBe(0);
    expect(diffDaysISO("2026-07-16", "2026-07-20")).toBe(4);
    expect(diffDaysISO("2026-07-20", "2026-07-16")).toBe(-4);
    expect(diffDaysISO("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("indexes weekdays from Monday and floors to Monday", () => {
    expect(weekdayIndexISO("2026-07-13")).toBe(0); // Monday
    expect(weekdayIndexISO("2026-07-16")).toBe(3); // Thursday
    expect(weekdayIndexISO("2026-07-19")).toBe(6); // Sunday
    expect(startOfWeekISO("2026-07-16")).toBe("2026-07-13");
    expect(startOfWeekISO("2026-07-13")).toBe("2026-07-13"); // idempotent
    expect(startOfWeekISO("2026-07-19")).toBe("2026-07-13");
  });

  it("adds months without overflowing short months", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsISO("2026-07-01", 6)).toBe("2027-01-01");
    expect(addMonthsISO("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("finds month and quarter bounds", () => {
    expect(endOfMonthISO("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonthISO("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonthISO("2026-12-01")).toBe("2026-12-31");
    expect(startOfQuarterISO("2026-07-16")).toBe("2026-07-01"); // Q3
    expect(startOfQuarterISO("2026-01-05")).toBe("2026-01-01"); // Q1
    expect(endOfQuarterISO("2026-07-16")).toBe("2026-09-30");
    expect(endOfQuarterISO("2026-11-02")).toBe("2026-12-31");
  });

  it("takes the UTC date part of a timestamp without parsing bare dates", () => {
    expect(toDateISO("2026-07-16")).toBe("2026-07-16");
    expect(toDateISO("2026-07-16T23:30:00.000Z")).toBe("2026-07-16");
    expect(toDateISO(new Date(Date.UTC(2026, 6, 16, 23, 30)))).toBe("2026-07-16");
  });

  it("does not shift a bare date by a day in the host timezone", () => {
    // The bug this whole module exists to avoid: new Date("2026-07-16") is UTC
    // midnight, and .getDate() then reads it back locally as the 15th west of
    // Greenwich. Every helper must be immune.
    for (const iso of ["2026-01-01", "2026-07-16", "2026-12-31"]) {
      expect(toDateISO(iso)).toBe(iso);
      expect(addDaysISO(iso, 0)).toBe(iso);
      expect(epochDayToISO(isoToEpochDay(iso))).toBe(iso);
    }
  });
});

// ---------------------------------------------------------------------------
// projectEffectiveStartISO
// ---------------------------------------------------------------------------

describe("projectEffectiveStartISO", () => {
  it("prefers an explicit start date", () => {
    expect(projectEffectiveStartISO(project({ startDate: "2026-03-04" }))).toBe("2026-03-04");
  });

  it("uses the semester start for a class with no start date", () => {
    expect(
      projectEffectiveStartISO(project({ isClass: true, semesterTerm: "fall", semesterYear: 2026 }))
    ).toBe("2026-09-01");
    expect(
      projectEffectiveStartISO(
        project({ isClass: true, semesterTerm: "spring", semesterYear: 2026 })
      )
    ).toBe("2026-01-01");
    expect(
      projectEffectiveStartISO(
        project({ isClass: true, semesterTerm: "summer", semesterYear: 2026 })
      )
    ).toBe("2026-06-01");
  });

  it("lets an explicit start date beat the semester anchor", () => {
    expect(
      projectEffectiveStartISO(
        project({
          startDate: "2026-08-20",
          isClass: true,
          semesterTerm: "fall",
          semesterYear: 2026,
        })
      )
    ).toBe("2026-08-20");
  });

  it("falls back to the createdAt date part", () => {
    expect(projectEffectiveStartISO(project())).toBe("2026-07-01");
    expect(projectEffectiveStartISO(project({ createdAt: new Date(Date.UTC(2025, 10, 2)) }))).toBe(
      "2025-11-02"
    );
  });

  it("falls back to createdAt for a class missing semester info", () => {
    expect(
      projectEffectiveStartISO(project({ isClass: true, semesterTerm: "fall", semesterYear: null }))
    ).toBe("2026-07-01");
    expect(
      projectEffectiveStartISO(project({ isClass: true, semesterTerm: null, semesterYear: 2026 }))
    ).toBe("2026-07-01");
  });

  it("ignores the semester anchor on a non-class row that carries one", () => {
    expect(
      projectEffectiveStartISO(
        project({ isClass: false, semesterTerm: "fall", semesterYear: 2026 })
      )
    ).toBe("2026-07-01");
  });
});

// ---------------------------------------------------------------------------
// computeWindow
// ---------------------------------------------------------------------------

describe("computeWindow", () => {
  it("centres on today when there are no projects", () => {
    const w = computeWindow([], "months", TODAY);
    expect(w.startISO < TODAY).toBe(true);
    expect(w.endISO > TODAY).toBe(true);
    expect(w.pxPerDay).toBe(ZOOM_PX_PER_DAY.months);
  });

  it("spans every project anchor plus today, padded", () => {
    const w = computeWindow(
      [project({ startDate: "2026-05-01", endDate: "2026-06-01" })],
      "weeks",
      TODAY
    );
    expect(w.startISO < "2026-05-01").toBe(true);
    expect(w.endISO >= TODAY).toBe(true); // today is past the last end date
  });

  it("always contains today, even when every project is in the past", () => {
    const w = computeWindow(
      [project({ startDate: "2020-01-01", endDate: "2020-06-01" })],
      "quarters",
      TODAY
    );
    expect(w.startISO <= TODAY && TODAY <= w.endISO).toBe(true);
  });

  it("always contains today, even when every project is far in the future", () => {
    const w = computeWindow(
      [project({ startDate: "2030-01-01", endDate: "2030-06-01" })],
      "quarters",
      TODAY
    );
    expect(w.startISO <= TODAY && TODAY <= w.endISO).toBe(true);
  });

  it("snaps to week bounds at weeks and months zoom", () => {
    for (const zoom of ["weeks", "months"] as const) {
      const w = computeWindow([project({ startDate: "2026-05-06" })], zoom, TODAY);
      expect(weekdayIndexISO(w.startISO)).toBe(0); // Monday
      expect(weekdayIndexISO(w.endISO)).toBe(6); // Sunday
      expect((diffDaysISO(w.startISO, w.endISO) + 1) % 7).toBe(0);
    }
  });

  it("snaps to month bounds at quarters zoom", () => {
    const w = computeWindow([project({ startDate: "2026-05-06" })], "quarters", TODAY);
    expect(w.startISO.slice(8, 10)).toBe("01");
    expect(w.endISO).toBe(endOfMonthISO(w.endISO));
  });

  it("caps a span one ancient createdAt would otherwise blow open", () => {
    const w = computeWindow(
      [project({ createdAt: "2005-01-01T00:00:00.000Z" }), project({ id: "p2" })],
      "quarters",
      TODAY
    );
    // Snapping to whole months can add a few days past the cap; the point is
    // that ~21 years of data does not become ~21 years of columns.
    expect(diffDaysISO(w.startISO, w.endISO) + 1).toBeLessThanOrEqual(MAX_WINDOW_DAYS + 62);
    expect(w.startISO > "2005-01-01").toBe(true);
    expect(w.startISO <= TODAY && TODAY <= w.endISO).toBe(true);
  });

  it("reports a canvas width matching the span", () => {
    const w = computeWindow([project({ startDate: "2026-07-01" })], "months", TODAY);
    expect(w.totalWidthPx).toBe((diffDaysISO(w.startISO, w.endISO) + 1) * w.pxPerDay);
  });

  it("does not let a corrupt end date drag the window backwards", () => {
    const w = computeWindow(
      [project({ startDate: "2026-07-01", endDate: "2020-01-01" })],
      "months",
      TODAY
    );
    expect(w.startISO <= TODAY && TODAY <= w.endISO).toBe(true);
    expect(w.endISO >= "2026-07-01").toBe(true);
  });

  it("spans a class by its semester when it carries no dates", () => {
    const w = computeWindow(
      [project({ isClass: true, semesterTerm: "fall", semesterYear: 2026 })],
      "months",
      TODAY
    );
    expect(w.startISO <= "2026-09-01").toBe(true);
    expect(w.endISO >= "2026-12-31").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

describe("columnsForWindow", () => {
  it("emits one day column per day at weeks zoom", () => {
    const w = windowOf("2026-07-13", "2026-07-19", ZOOM_PX_PER_DAY.weeks);
    const cols = columnsForWindow(w, "weeks");
    expect(cols).toHaveLength(7);
    expect(cols[0].startISO).toBe("2026-07-13");
    expect(cols[0].endISO).toBe("2026-07-13");
    expect(cols[0].label).toBe("13");
    expect(cols[0].leftPx).toBe(0);
    expect(cols[0].widthPx).toBe(ZOOM_PX_PER_DAY.weeks);
    expect(cols[6].startISO).toBe("2026-07-19");
    expect(cols[6].leftPx).toBe(6 * ZOOM_PX_PER_DAY.weeks);
  });

  it("emits one week column per week at months zoom", () => {
    const w = windowOf("2026-07-13", "2026-08-09", ZOOM_PX_PER_DAY.months);
    const cols = columnsForWindow(w, "months");
    expect(cols).toHaveLength(4);
    expect(cols[0].startISO).toBe("2026-07-13");
    expect(cols[0].endISO).toBe("2026-07-19");
    expect(cols[0].label).toBe("Jul 13");
    expect(cols[0].widthPx).toBe(7 * ZOOM_PX_PER_DAY.months);
    expect(cols[3].startISO).toBe("2026-08-03");
  });

  it("emits one month column per month at quarters zoom", () => {
    const w = windowOf("2026-07-01", "2026-09-30", ZOOM_PX_PER_DAY.quarters);
    const cols = columnsForWindow(w, "quarters");
    expect(cols.map((c) => c.label)).toEqual(["Jul", "Aug", "Sep"]);
    expect(cols[0].widthPx).toBe(31 * ZOOM_PX_PER_DAY.quarters);
    expect(cols[1].widthPx).toBe(31 * ZOOM_PX_PER_DAY.quarters);
    expect(cols[2].widthPx).toBe(30 * ZOOM_PX_PER_DAY.quarters);
  });

  it("tiles the window exactly, with no gaps or overlaps", () => {
    for (const zoom of ["weeks", "months", "quarters"] as const) {
      const w = computeWindow([project({ startDate: "2026-02-11" })], zoom, TODAY);
      const cols = columnsForWindow(w, zoom);
      expect(cols[0].startISO).toBe(w.startISO);
      expect(cols[cols.length - 1].endISO).toBe(w.endISO);
      for (let i = 1; i < cols.length; i++) {
        expect(cols[i].startISO).toBe(addDaysISO(cols[i - 1].endISO, 1));
        expect(cols[i].leftPx).toBe(cols[i - 1].leftPx + cols[i - 1].widthPx);
      }
      const total = cols.reduce((sum, c) => sum + c.widthPx, 0);
      expect(total).toBe(w.totalWidthPx);
    }
  });
});

describe("headerGroupsForWindow", () => {
  it("groups days under weeks at weeks zoom", () => {
    const w = windowOf("2026-07-13", "2026-07-26", ZOOM_PX_PER_DAY.weeks);
    const groups = headerGroupsForWindow(w, "weeks");
    expect(groups.map((g) => g.label)).toEqual(["Jul 13", "Jul 20"]);
  });

  it("groups weeks under months at months zoom", () => {
    const w = windowOf("2026-06-29", "2026-08-02", ZOOM_PX_PER_DAY.months);
    const groups = headerGroupsForWindow(w, "months");
    expect(groups.map((g) => g.label)).toEqual(["Jun 2026", "Jul 2026", "Aug 2026"]);
  });

  it("groups months under quarters at quarters zoom", () => {
    const w = windowOf("2026-07-01", "2027-01-31", ZOOM_PX_PER_DAY.quarters);
    const groups = headerGroupsForWindow(w, "quarters");
    expect(groups.map((g) => g.label)).toEqual(["Q3 2026", "Q4 2026", "Q1 2027"]);
  });

  it("clips an edge group to the window but keeps its true label", () => {
    // The window opens mid-June, so the June group is three days wide and still
    // reads "Jun 2026" rather than being relabelled by its clipped start.
    const w = windowOf("2026-06-29", "2026-08-02", ZOOM_PX_PER_DAY.months);
    const groups = headerGroupsForWindow(w, "months");
    expect(groups[0].label).toBe("Jun 2026");
    expect(groups[0].startISO).toBe("2026-06-29");
    expect(groups[0].leftPx).toBe(0);
    expect(groups[0].widthPx).toBe(2 * ZOOM_PX_PER_DAY.months);
    expect(groups[groups.length - 1].endISO).toBe("2026-08-02");
  });

  it("tiles the window exactly at every zoom", () => {
    for (const zoom of ["weeks", "months", "quarters"] as const) {
      const w = computeWindow([project({ startDate: "2026-02-11" })], zoom, TODAY);
      const groups = headerGroupsForWindow(w, zoom);
      expect(groups[0].startISO).toBe(w.startISO);
      expect(groups[groups.length - 1].endISO).toBe(w.endISO);
      expect(groups.reduce((sum, g) => sum + g.widthPx, 0)).toBe(w.totalWidthPx);
    }
  });
});

describe("markCurrentColumn", () => {
  it("marks exactly the column containing today", () => {
    const w = windowOf("2026-07-13", "2026-07-19");
    const cols = markCurrentColumn(columnsForWindow(w, "weeks"), TODAY);
    expect(cols.filter((c) => c.isCurrent)).toHaveLength(1);
    expect(cols.find((c) => c.isCurrent)?.startISO).toBe(TODAY);
  });

  it("marks the enclosing column when today is not a column start", () => {
    const w = windowOf("2026-07-13", "2026-08-09", ZOOM_PX_PER_DAY.months);
    const cols = markCurrentColumn(columnsForWindow(w, "months"), TODAY);
    const current = cols.find((c) => c.isCurrent);
    expect(current?.startISO).toBe("2026-07-13");
    expect(current?.endISO).toBe("2026-07-19");
  });

  it("marks nothing when today is outside the window", () => {
    const w = windowOf("2026-01-05", "2026-01-11");
    const cols = markCurrentColumn(columnsForWindow(w, "weeks"), TODAY);
    expect(cols.some((c) => c.isCurrent)).toBe(false);
  });
});

describe("todayOffsetPx", () => {
  it("places today at its day offset", () => {
    expect(todayOffsetPx(windowOf("2026-07-13", "2026-07-19"), TODAY)).toBe(30);
  });

  it("is null when today falls outside the window", () => {
    expect(todayOffsetPx(windowOf("2026-08-01", "2026-08-31"), TODAY)).toBeNull();
    expect(todayOffsetPx(windowOf("2026-01-01", "2026-01-31"), TODAY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// barGeometry
// ---------------------------------------------------------------------------

describe("barGeometry", () => {
  const w = windowOf("2026-07-01", "2026-07-31"); // 31 days at 10px

  it("places a bounded bar at its start, inclusive of both ends", () => {
    const g = barGeometry(project({ startDate: "2026-07-06", endDate: "2026-07-10" }), w, TODAY);
    expect(g.leftPx).toBe(50);
    expect(g.widthPx).toBe(50); // 5 days inclusive
    expect(g).toMatchObject({
      clampedStart: false,
      clampedEnd: false,
      openEnded: false,
      corrupt: false,
      visible: true,
    });
  });

  it("runs an open-ended bar to the window edge", () => {
    const g = barGeometry(project({ startDate: "2026-07-06", endDate: null }), w, TODAY);
    expect(g.openEnded).toBe(true);
    expect(g.leftPx).toBe(50);
    expect(g.leftPx + g.widthPx).toBe(w.totalWidthPx);
    expect(g.clampedEnd).toBe(false); // the fade says "onward", not the clamp flag
  });

  it("treats a both-null project as starting at createdAt and open-ended", () => {
    const g = barGeometry(project({ createdAt: "2026-07-06T09:00:00.000Z" }), w, TODAY);
    expect(g.leftPx).toBe(50);
    expect(g.openEnded).toBe(true);
    expect(g.leftPx + g.widthPx).toBe(w.totalWidthPx);
  });

  it("clamps a start that predates the window and flags the left fade", () => {
    const g = barGeometry(project({ startDate: "2026-06-01", endDate: "2026-07-10" }), w, TODAY);
    expect(g.leftPx).toBe(0);
    expect(g.widthPx).toBe(100); // Jul 1..10
    expect(g.clampedStart).toBe(true);
  });

  it("clamps an end that outruns the window and flags the right fade", () => {
    const g = barGeometry(project({ startDate: "2026-07-20", endDate: "2026-09-01" }), w, TODAY);
    expect(g.leftPx).toBe(190);
    expect(g.leftPx + g.widthPx).toBe(w.totalWidthPx);
    expect(g.clampedEnd).toBe(true);
    expect(g.openEnded).toBe(false);
  });

  it("clamps a bar that swallows the window at both edges", () => {
    const g = barGeometry(project({ startDate: "2026-01-01", endDate: "2026-12-31" }), w, TODAY);
    expect(g.leftPx).toBe(0);
    expect(g.widthPx).toBe(w.totalWidthPx);
    expect(g.clampedStart).toBe(true);
    expect(g.clampedEnd).toBe(true);
  });

  it("renders a corrupt start-after-end row as a 1-day bar and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = project({ id: "corrupt-1", startDate: "2026-07-20", endDate: "2026-07-10" });

    const g = barGeometry(p, w, TODAY);
    expect(g.corrupt).toBe(true);
    expect(g.leftPx).toBe(190); // pinned at the start anchor
    expect(g.widthPx).toBe(10); // one day
    expect(warn).toHaveBeenCalledTimes(1);

    barGeometry(p, w, TODAY); // a drag re-renders constantly; do not flood
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("floors a sub-pixel bar to a minimum width", () => {
    const thin = windowOf("2026-07-01", "2026-07-31", ZOOM_PX_PER_DAY.quarters);
    const g = barGeometry(project({ startDate: "2026-07-06", endDate: "2026-07-06" }), thin, TODAY);
    expect(g.widthPx).toBe(MIN_BAR_WIDTH_PX); // 1 day * 3px would be unclickable
  });

  it("does not floor a bar that is already wide enough", () => {
    const g = barGeometry(project({ startDate: "2026-07-06", endDate: "2026-07-08" }), w, TODAY);
    expect(g.widthPx).toBe(30);
  });

  it("marks a project outside a clamped window invisible", () => {
    const before = barGeometry(
      project({ startDate: "2026-01-01", endDate: "2026-02-01" }),
      w,
      TODAY
    );
    expect(before.visible).toBe(false);
    expect(before.widthPx).toBe(0);

    const after = barGeometry(
      project({ startDate: "2026-09-01", endDate: "2026-10-01" }),
      w,
      TODAY
    );
    expect(after.visible).toBe(false);
  });

  it("keeps a bar touching the window by a single day visible", () => {
    expect(
      barGeometry(project({ startDate: "2026-06-01", endDate: "2026-07-01" }), w, TODAY).visible
    ).toBe(true);
    expect(
      barGeometry(project({ startDate: "2026-07-31", endDate: "2026-08-31" }), w, TODAY).visible
    ).toBe(true);
  });

  it("spans a class across its semester", () => {
    const term = windowOf("2026-09-01", "2026-12-31");
    const g = barGeometry(
      project({ isClass: true, semesterTerm: "fall", semesterYear: 2026 }),
      term,
      TODAY
    );
    expect(g.leftPx).toBe(0);
    expect(g.openEnded).toBe(false);
    expect(g.leftPx + g.widthPx).toBe(term.totalWidthPx); // Sep 1 .. Dec 31
  });
});

// ---------------------------------------------------------------------------
// Drag math
// ---------------------------------------------------------------------------

describe("pxToISODate / isoDateToPx", () => {
  const w = windowOf("2026-07-01", "2026-07-31");

  it("maps an offset to the date whose cell contains it", () => {
    expect(pxToISODate(0, w)).toBe("2026-07-01");
    expect(pxToISODate(9, w)).toBe("2026-07-01"); // still inside day 1's cell
    expect(pxToISODate(10, w)).toBe("2026-07-02");
    expect(pxToISODate(105, w)).toBe("2026-07-11");
  });

  it("round-trips against isoDateToPx", () => {
    for (const iso of ["2026-07-01", "2026-07-16", "2026-07-31"]) {
      expect(pxToISODate(isoDateToPx(iso, w), w)).toBe(iso);
    }
  });

  it("runs past the window edges rather than sticking to them", () => {
    // A drag past the edge auto-scrolls, so the caller needs the true date.
    expect(pxToISODate(-10, w)).toBe("2026-06-30");
    expect(pxToISODate(-1, w)).toBe("2026-06-30"); // floor, not truncate
    expect(pxToISODate(400, w)).toBe("2026-08-10");
  });
});

describe("snapISO", () => {
  it("snaps to the day at weeks and months zoom", () => {
    expect(snapISO("2026-07-16", "weeks")).toBe("2026-07-16");
    expect(snapISO("2026-07-16", "months")).toBe("2026-07-16");
  });

  it("snaps to the week at quarters zoom, where a day is 3px", () => {
    expect(snapISO("2026-07-16", "quarters")).toBe("2026-07-13"); // Thu -> Mon
    expect(snapISO("2026-07-13", "quarters")).toBe("2026-07-13"); // idempotent
    expect(snapISO("2026-07-19", "quarters")).toBe("2026-07-13"); // Sun -> Mon
  });
});

describe("pxToSnappedDayDelta", () => {
  const w = windowOf("2026-07-01", "2026-07-31");

  it("moves whole days at weeks and months zoom", () => {
    expect(pxToSnappedDayDelta(30, w, "months")).toBe(3);
    expect(pxToSnappedDayDelta(-30, w, "weeks")).toBe(-3);
    expect(pxToSnappedDayDelta(4, w, "months")).toBe(0); // under half a day
    expect(pxToSnappedDayDelta(6, w, "months")).toBe(1); // over half a day
  });

  it("moves whole weeks at quarters zoom", () => {
    expect(pxToSnappedDayDelta(100, w, "quarters")).toBe(7); // 10 days -> 1 week
    expect(pxToSnappedDayDelta(30, w, "quarters")).toBe(0); // 3 days -> no move
    expect(pxToSnappedDayDelta(-100, w, "quarters")).toBe(-7);
  });
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

describe("isSentinelArea", () => {
  it("identifies the No Area sentinel structurally", () => {
    expect(isSentinelArea({ name: "No Area", emoji: null })).toBe(true);
    expect(isSentinelArea({ name: "No Area", emoji: "📁" })).toBe(false);
    expect(isSentinelArea({ name: "Research", emoji: null })).toBe(false);
  });
});

describe("isProjectGhost", () => {
  it("ghosts an archived project", () => {
    expect(isProjectGhost(project({ archivedAt: "2026-07-01T00:00:00.000Z" }), TODAY)).toBe(true);
  });

  it("ghosts a project past its end date (the archive trap, Issue #55)", () => {
    expect(isProjectGhost(project({ endDate: "2026-07-15" }), TODAY)).toBe(true);
    expect(isProjectGhost(project({ endDate: TODAY }), TODAY)).toBe(false); // ends today
    expect(isProjectGhost(project({ endDate: "2026-07-17" }), TODAY)).toBe(false);
  });

  it("ghosts a class whose semester has passed", () => {
    expect(
      isProjectGhost(project({ isClass: true, semesterTerm: "spring", semesterYear: 2026 }), TODAY)
    ).toBe(true);
    expect(
      isProjectGhost(project({ isClass: true, semesterTerm: "fall", semesterYear: 2026 }), TODAY)
    ).toBe(false);
  });

  it("keeps an open-ended project alive", () => {
    expect(isProjectGhost(project(), TODAY)).toBe(false);
  });
});

describe("groupByArea", () => {
  const areas = [
    area({ id: "b", name: "Body", orderIndex: 2 }),
    area({ id: "none", name: "No Area", emoji: null, orderIndex: 0 }),
    area({ id: "r", name: "Research", orderIndex: 1 }),
  ];
  const opts = { showArchived: false, todayISO: TODAY };

  it("orders areas by orderIndex and pins the sentinel last", () => {
    const groups = groupByArea(areas, [], opts);
    expect(groups.map((g) => g.area.id)).toEqual(["r", "b", "none"]);
    expect(groups[2].area.isSentinel).toBe(true);
    expect(groups[0].area.isSentinel).toBe(false);
  });

  it("breaks an orderIndex tie by createdAt", () => {
    const tied = [
      area({ id: "late", orderIndex: 0, createdAt: "2026-03-01T00:00:00.000Z" }),
      area({ id: "early", orderIndex: 0, createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(groupByArea(tied, [], opts).map((g) => g.area.id)).toEqual(["early", "late"]);
  });

  it("orders projects inside an area by orderIndex then createdAt", () => {
    const projects = [
      project({ id: "p3", areaId: "r", orderIndex: 1 }),
      project({ id: "p2", areaId: "r", orderIndex: 0, createdAt: "2026-02-01T00:00:00.000Z" }),
      project({ id: "p1", areaId: "r", orderIndex: 0, createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const groups = groupByArea(areas, projects, opts);
    expect(groups[0].projects.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("buckets projects into their own areas", () => {
    const projects = [
      project({ id: "p1", areaId: "r" }),
      project({ id: "p2", areaId: "b" }),
      project({ id: "p3", areaId: "none" }),
    ];
    const groups = groupByArea(areas, projects, opts);
    expect(groups.map((g) => g.projects.map((p) => p.id))).toEqual([["p1"], ["p2"], ["p3"]]);
  });

  it("hides ghosts unless showArchived, and flags them when shown", () => {
    const projects = [
      project({ id: "live", areaId: "r" }),
      project({ id: "archived", areaId: "r", archivedAt: "2026-01-01T00:00:00.000Z" }),
      project({ id: "expired", areaId: "r", endDate: "2026-01-01" }),
    ];

    const hidden = groupByArea(areas, projects, opts);
    expect(hidden[0].projects.map((p) => p.id)).toEqual(["live"]);

    const shown = groupByArea(areas, projects, { ...opts, showArchived: true });
    expect(shown[0].projects.map((p) => p.id)).toEqual(["live", "archived", "expired"]);
    expect(shown[0].projects.map((p) => p.isGhost)).toEqual([false, true, true]);
  });

  it("keeps areas that have no projects", () => {
    const groups = groupByArea(areas, [project({ id: "p1", areaId: "r" })], opts);
    expect(groups).toHaveLength(3);
    expect(groups[1].projects).toEqual([]);
  });

  it("drops a project whose area was not passed in", () => {
    // /areas filters archived areas server-side, so their projects arrive orphaned.
    const groups = groupByArea(areas, [project({ id: "orphan", areaId: "gone" })], opts);
    expect(groups.flatMap((g) => g.projects)).toEqual([]);
  });

  it("handles zero areas and zero projects", () => {
    expect(groupByArea([], [], opts)).toEqual([]);
    expect(groupByArea([], [project()], opts)).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const projects = [
      project({ id: "p2", areaId: "r", orderIndex: 1 }),
      project({ id: "p1", areaId: "r", orderIndex: 0 }),
    ];
    const areaOrder = areas.map((a) => a.id);
    groupByArea(areas, projects, opts);
    expect(projects.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(areas.map((a) => a.id)).toEqual(areaOrder);
  });
});
