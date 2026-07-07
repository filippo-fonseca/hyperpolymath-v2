/**
 * meridianLayout.test.ts — M-02 · The Studiolo · Phase 2 acceptance truth tables
 *
 * Pure-layer coverage per §3 (M-02): the dial angle math incl. a DST-transition
 * day (America/New_York spring-forward, a 23h day — afternoon events must NOT be
 * misplaced), the `visibleSlots` ~28h window roll across a day boundary,
 * `classifyTablet` exact boundaries (T-15, start, end), and the conservative
 * `linkEventToProject` heuristic (course-code hit, plain miss, ambiguous → null).
 * Also spot-checks the additive `resolveOverlaps` lane/merge helper and the
 * tint doctrine (never calendar bg on the glass).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import {
  timeToAngle,
  ringRotationFor,
  solveMeridianLayout,
  visibleSlots,
  classifyTablet,
  linkEventToProject,
  resolveOverlaps,
  TWO_PI,
  WINDOW_HALF_MS,
  IMMINENT_MS,
  MIN_TABLET_SPAN_RAD,
  ZENITH_ANGLE,
  type TabletSlot,
} from "../meridianLayout";
import { PARCHMENT_HEX } from "../meridianMappings";

const NY = "America/New_York";

// ── fixtures ────────────────────────────────────────────────────────────────
function mkSlot(over: Partial<TabletSlot>): TabletSlot {
  return {
    eventId: over.eventId ?? "e",
    calendarId: over.calendarId ?? "cal",
    title: over.title ?? "Event",
    startMs: over.startMs ?? 0,
    endMs: over.endMs ?? 0,
    allDay: over.allDay ?? false,
    angleStart: over.angleStart ?? 0,
    angleSpan: over.angleSpan ?? MIN_TABLET_SPAN_RAD,
    dayOffset: over.dayOffset ?? 0,
    linkedAreaId: over.linkedAreaId ?? null,
    linkedProjectId: over.linkedProjectId ?? null,
    colorHex: over.colorHex ?? PARCHMENT_HEX,
  };
}

function mkEvent(over: Partial<GcalEventDTO>): GcalEventDTO {
  return {
    id: over.id ?? "e",
    calendarId: over.calendarId ?? "primary",
    title: over.title ?? "Event",
    start: over.start ?? "2026-07-06T14:00:00-04:00",
    end: over.end ?? "2026-07-06T15:00:00-04:00",
    allDay: over.allDay ?? false,
    description: over.description ?? null,
    colorId: over.colorId ?? null,
    recurringEventId: over.recurringEventId ?? null,
    htmlLink: over.htmlLink ?? "",
  };
}

function mkArea(
  id: string,
  projects: Array<{ id: string; name: string; isClass?: boolean }>,
): SidebarArea {
  return {
    id,
    name: id,
    emoji: null,
    orderIndex: 0,
    archivedAt: null,
    projects: projects.map((p, i) => ({
      id: p.id,
      name: p.name,
      icon: null,
      orderIndex: i,
      isClass: p.isClass ?? false,
      archivedAt: null,
    })),
  };
}

const NO_CALS: GcalCalendarMeta[] = [];

afterEach(() => {
  vi.useRealTimers();
});

// ── timeToAngle / ringRotationFor — incl. DST spring-forward ─────────────────
describe("timeToAngle — 24h dial (0 = midnight, π = noon)", () => {
  it("midnight → 0, noon → π, 6pm → 3π/2", () => {
    expect(timeToAngle(Date.parse("2026-07-06T00:00:00-04:00"), NY)).toBeCloseTo(
      0,
      9,
    );
    expect(timeToAngle(Date.parse("2026-07-06T12:00:00-04:00"), NY)).toBeCloseTo(
      Math.PI,
      9,
    );
    expect(timeToAngle(Date.parse("2026-07-06T18:00:00-04:00"), NY)).toBeCloseTo(
      (3 * TWO_PI) / 4,
      9,
    );
  });

  it("DST spring-forward (2026-03-08, a 23h NY day) does NOT misplace 2pm", () => {
    // Clocks jump 02:00 EST → 03:00 EDT this day. A 2pm EDT event must still
    // sit at 14/24 of the dial — i.e. identical to any normal day's 2pm.
    const dstAfternoon = Date.parse("2026-03-08T14:00:00-04:00");
    const normalAfternoon = Date.parse("2026-07-06T14:00:00-04:00");
    const expected = (14 / 24) * TWO_PI;

    expect(timeToAngle(dstAfternoon, NY)).toBeCloseTo(expected, 9);
    // The key property: DST day and normal day agree on 2pm's position.
    expect(timeToAngle(dstAfternoon, NY)).toBeCloseTo(
      timeToAngle(normalAfternoon, NY),
      9,
    );

    // Anti-regression: a naive "ms since local midnight / 86400" would place it
    // at 13/24 (only 13h elapsed on this short day). Prove we did NOT do that.
    const localMidnight = Date.parse("2026-03-08T00:00:00-05:00"); // still EST
    const naive = ((dstAfternoon - localMidnight) / 86_400_000) * TWO_PI;
    expect(naive).toBeCloseTo((13 / 24) * TWO_PI, 6);
    expect(timeToAngle(dstAfternoon, NY)).not.toBeCloseTo(naive, 3);
  });

  it("pre-transition morning (1am EST) sits at 1/24 of the dial", () => {
    expect(
      timeToAngle(Date.parse("2026-03-08T01:00:00-05:00"), NY),
    ).toBeCloseTo((1 / 24) * TWO_PI, 9);
  });
});

describe("ringRotationFor — now rolled to zenith", () => {
  it("rotation = ZENITH_ANGLE − timeToAngle(now + scrub)", () => {
    const now = Date.parse("2026-07-06T09:00:00-04:00");
    expect(ringRotationFor(now, 0, NY)).toBeCloseTo(
      ZENITH_ANGLE - timeToAngle(now, NY),
      9,
    );
  });

  it("scrubbing a full day returns the dial to the same orientation", () => {
    const now = Date.parse("2026-07-06T09:00:00-04:00");
    const dayMs = 24 * 60 * 60 * 1000;
    // Same time-of-day next day ⇒ identical dial angle (days flicker, not spin).
    expect(ringRotationFor(now, dayMs, NY)).toBeCloseTo(
      ringRotationFor(now, 0, NY),
      9,
    );
  });
});

// ── visibleSlots — ~28h window roll across a day boundary ────────────────────
describe("visibleSlots — zenith ±14h window", () => {
  const center = Date.parse("2026-07-06T00:00:00-04:00"); // midnight boundary
  const H = 60 * 60 * 1000;

  it("includes slots overlapping [center−14h, center+14h], excludes the rest", () => {
    const slots = [
      mkSlot({ eventId: "in-before", startMs: center - 13 * H, endMs: center - 13 * H + H }),
      mkSlot({ eventId: "in-after", startMs: center + 13 * H, endMs: center + 13 * H + H }),
      mkSlot({ eventId: "out-before", startMs: center - 16 * H, endMs: center - 15 * H }),
      mkSlot({ eventId: "out-after", startMs: center + 15 * H, endMs: center + 16 * H }),
    ];
    const ids = visibleSlots(slots, center, NY)
      .map((s) => s.eventId)
      .sort();
    expect(ids).toEqual(["in-after", "in-before"]);
  });

  it("a slot straddling the far edge is visible via overlap", () => {
    const straddle = mkSlot({
      eventId: "straddle",
      startMs: center + WINDOW_HALF_MS - H,
      endMs: center + WINDOW_HALF_MS + H,
    });
    expect(visibleSlots([straddle], center, NY).map((s) => s.eventId)).toEqual([
      "straddle",
    ]);
  });

  it("rolling the window across the day boundary swaps which slots show", () => {
    const yesterdayEve = mkSlot({
      eventId: "prev-eve",
      startMs: center - 4 * H,
      endMs: center - 3 * H,
    });
    const tomorrowNoon = mkSlot({
      eventId: "next-noon",
      startMs: center + 36 * H,
      endMs: center + 37 * H,
    });
    const slots = [yesterdayEve, tomorrowNoon];
    // Center at the boundary: only the previous evening is in the past window.
    expect(visibleSlots(slots, center, NY).map((s) => s.eventId)).toEqual([
      "prev-eve",
    ]);
    // Roll the center forward a day and a half: now tomorrow-noon is in-window.
    const rolled = center + 36 * H;
    expect(visibleSlots(slots, rolled, NY).map((s) => s.eventId)).toEqual([
      "next-noon",
    ]);
  });

  it("caps all-day bands at 3 when more than 3 overlap the window", () => {
    const day = 24 * H;
    // Five all-day events all on the SAME civil day → all overlap a window
    // centered on that day; the cap keeps exactly 3 (a 24h-aligned 28h window
    // can only ever touch ≤3 distinct days, so same-day stacking is how the
    // cap is actually reached).
    const bands = [0, 1, 2, 3, 4].map((k) =>
      mkSlot({
        eventId: `band${k}`,
        allDay: true,
        startMs: center,
        endMs: center + day,
        angleSpan: TWO_PI,
      }),
    );
    const visible = visibleSlots(bands, center, NY).filter((s) => s.allDay);
    expect(visible.length).toBe(3);
  });
});

// ── classifyTablet — exact boundaries (T-15, start, end) ─────────────────────
describe("classifyTablet — boundary truth table", () => {
  const now = 1_000_000_000_000;
  const base = { startMs: now, endMs: now + 60 * 60 * 1000 };

  it("end ≤ now → past (exact end boundary is past)", () => {
    expect(
      classifyTablet(mkSlot({ startMs: now - 3600_000, endMs: now }), now),
    ).toBe("past");
  });

  it("start ≤ now < end → current (exact start boundary is current)", () => {
    expect(classifyTablet(mkSlot(base), now)).toBe("current");
    expect(
      classifyTablet(mkSlot(base), now + 30 * 60 * 1000),
    ).toBe("current");
  });

  it("exactly T-15 (start − now === 15min) → imminent", () => {
    const start = now + IMMINENT_MS;
    expect(
      classifyTablet(mkSlot({ startMs: start, endMs: start + 3600_000 }), now),
    ).toBe("imminent");
  });

  it("just past T-15 (15min + 1ms out) → upcoming", () => {
    const start = now + IMMINENT_MS + 1;
    expect(
      classifyTablet(mkSlot({ startMs: start, endMs: start + 3600_000 }), now),
    ).toBe("upcoming");
  });

  it("well in the future → upcoming", () => {
    const start = now + 5 * 60 * 60 * 1000;
    expect(
      classifyTablet(mkSlot({ startMs: start, endMs: start + 3600_000 }), now),
    ).toBe("upcoming");
  });
});

// ── linkEventToProject — conservative heuristic fixtures ─────────────────────
describe("linkEventToProject — course-code hit / miss / ambiguous", () => {
  const tree: SidebarArea[] = [
    mkArea("area-cs", [
      { id: "p-cpsc426", name: "CPSC 426: Building Interactive Machines", isClass: true },
      { id: "p-reading", name: "Reading Group" },
    ]),
    mkArea("area-sci", [
      { id: "p-physics", name: "Physics", isClass: true },
      { id: "p-chem", name: "Chemistry", isClass: true },
    ]),
  ];

  it("hit via course code 'CPSC 426' → the class project", () => {
    expect(linkEventToProject("CPSC 426 Lecture", tree)).toEqual({
      areaId: "area-cs",
      projectId: "p-cpsc426",
    });
  });

  it("hit via fused course code 'CPSC426'", () => {
    expect(linkEventToProject("cpsc426 review session", tree)).toEqual({
      areaId: "area-cs",
      projectId: "p-cpsc426",
    });
  });

  it("hit via whole-word class name", () => {
    expect(linkEventToProject("Physics problem set", tree)).toEqual({
      areaId: "area-sci",
      projectId: "p-physics",
    });
  });

  it("plain miss → null (no matching words)", () => {
    expect(linkEventToProject("Lunch with Ana", tree)).toBeNull();
  });

  it("ambiguous ≥2 class hits → null (wrong tint worse than none)", () => {
    expect(linkEventToProject("Physics and Chemistry review", tree)).toBeNull();
  });

  it("empty / punctuation-only title → null", () => {
    expect(linkEventToProject("   ", tree)).toBeNull();
    expect(linkEventToProject("!!!", tree)).toBeNull();
  });

  it("archived projects/areas are ignored", () => {
    const archived: SidebarArea[] = [
      {
        ...mkArea("area-x", [{ id: "p-x", name: "Physics", isClass: true }]),
        projects: [
          {
            id: "p-x",
            name: "Physics",
            icon: null,
            orderIndex: 0,
            isClass: true,
            archivedAt: new Date(),
          },
        ],
      },
    ];
    expect(linkEventToProject("Physics lecture", archived)).toBeNull();
  });

  it("class precedence: a class hit wins over a non-class name hit", () => {
    const mixed: SidebarArea[] = [
      mkArea("a", [
        { id: "c", name: "Seminar", isClass: true },
        { id: "n", name: "Seminar", isClass: false },
      ]),
    ];
    expect(linkEventToProject("Seminar", mixed)).toEqual({
      areaId: "a",
      projectId: "c",
    });
  });
});

// ── solveMeridianLayout — integration of angle/span/dayOffset/tint ───────────
describe("solveMeridianLayout", () => {
  it("places a timed event's angleStart at its wall-clock dial angle (DST day)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T09:00:00-04:00"));
    const { slots, byEvent } = solveMeridianLayout(
      [mkEvent({ id: "lec", start: "2026-03-08T14:00:00-04:00", end: "2026-03-08T15:00:00-04:00" })],
      [],
      NO_CALS,
      NY,
    );
    expect(slots).toHaveLength(1);
    expect(byEvent.get("lec")!.angleStart).toBeCloseTo((14 / 24) * TWO_PI, 9);
    expect(byEvent.get("lec")!.dayOffset).toBe(0);
  });

  it("clamps a 5-minute event to the 20-minute min span", () => {
    const { byEvent } = solveMeridianLayout(
      [mkEvent({ id: "standup", start: "2026-07-06T09:00:00-04:00", end: "2026-07-06T09:05:00-04:00" })],
      [],
      NO_CALS,
      NY,
    );
    expect(byEvent.get("standup")!.angleSpan).toBeCloseTo(MIN_TABLET_SPAN_RAD, 9);
  });

  it("all-day event spans the full dial", () => {
    const { byEvent } = solveMeridianLayout(
      [mkEvent({ id: "holiday", allDay: true, start: "2026-07-06", end: "2026-07-07" })],
      [],
      NO_CALS,
      NY,
    );
    const s = byEvent.get("holiday")!;
    expect(s.allDay).toBe(true);
    expect(s.angleSpan).toBeCloseTo(TWO_PI, 9);
  });

  it("computes dayOffset relative to today in tz", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T09:00:00-04:00"));
    const { byEvent } = solveMeridianLayout(
      [
        mkEvent({ id: "y", start: "2026-07-05T10:00:00-04:00", end: "2026-07-05T11:00:00-04:00" }),
        mkEvent({ id: "t", start: "2026-07-06T10:00:00-04:00", end: "2026-07-06T11:00:00-04:00" }),
        mkEvent({ id: "m", start: "2026-07-08T10:00:00-04:00", end: "2026-07-08T11:00:00-04:00" }),
      ],
      [],
      NO_CALS,
      NY,
    );
    expect(byEvent.get("y")!.dayOffset).toBe(-1);
    expect(byEvent.get("t")!.dayOffset).toBe(0);
    expect(byEvent.get("m")!.dayOffset).toBe(2);
  });

  it("tint doctrine: linked → area hue hex; unlinked → parchment; never calendar bg", () => {
    const tree = [mkArea("area-cs", [{ id: "p-cpsc426", name: "CPSC 426", isClass: true }])];
    const cals: GcalCalendarMeta[] = [
      { id: "primary", summary: "P", backgroundColor: "#FF0000", foregroundColor: "#fff", primary: true, accessRole: "owner" },
    ];
    const { byEvent } = solveMeridianLayout(
      [
        mkEvent({ id: "linked", title: "CPSC 426 Lecture", calendarId: "primary" }),
        mkEvent({ id: "plain", title: "Lunch with Ana", calendarId: "primary" }),
      ],
      tree,
      cals,
      NY,
    );
    const linked = byEvent.get("linked")!;
    expect(linked.linkedAreaId).toBe("area-cs");
    expect(linked.colorHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(linked.colorHex).not.toBe("#ff0000"); // NEVER the calendar bg

    const plain = byEvent.get("plain")!;
    expect(plain.linkedAreaId).toBeNull();
    expect(plain.colorHex).toBe(PARCHMENT_HEX);
  });
});

// ── resolveOverlaps — lanes ≤2, merge at 3+ (additive helper) ─────────────────
describe("resolveOverlaps — radial lanes then merge-with-count", () => {
  const H = 60 * 60 * 1000;
  const t0 = 1_000_000_000_000;

  it("two overlapping events → lanes 0 and 1", () => {
    const placements = resolveOverlaps([
      mkSlot({ eventId: "a", startMs: t0, endMs: t0 + 2 * H }),
      mkSlot({ eventId: "b", startMs: t0 + H, endMs: t0 + 3 * H }),
    ]);
    expect(placements.map((p) => p.lane).sort()).toEqual([0, 1]);
    expect(placements.every((p) => p.mergedCount === 1)).toBe(true);
  });

  it("three concurrent events → one merged placement with count 3", () => {
    const placements = resolveOverlaps([
      mkSlot({ eventId: "a", startMs: t0, endMs: t0 + 3 * H }),
      mkSlot({ eventId: "b", startMs: t0 + 0.5 * H, endMs: t0 + 2 * H }),
      mkSlot({ eventId: "c", startMs: t0 + H, endMs: t0 + 2.5 * H }),
    ]);
    expect(placements).toHaveLength(1);
    expect(placements[0]!.mergedCount).toBe(3);
    expect(placements[0]!.mergedEventIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("non-overlapping events stay lone lane-0 placements", () => {
    const placements = resolveOverlaps([
      mkSlot({ eventId: "a", startMs: t0, endMs: t0 + H }),
      mkSlot({ eventId: "b", startMs: t0 + 2 * H, endMs: t0 + 3 * H }),
    ]);
    expect(placements).toHaveLength(2);
    expect(placements.every((p) => p.lane === 0 && p.mergedCount === 1)).toBe(true);
  });

  it("ignores all-day slots (they live on the outer lip)", () => {
    const placements = resolveOverlaps([
      mkSlot({ eventId: "ad", allDay: true, startMs: t0, endMs: t0 + 24 * H }),
    ]);
    expect(placements).toHaveLength(0);
  });
});
