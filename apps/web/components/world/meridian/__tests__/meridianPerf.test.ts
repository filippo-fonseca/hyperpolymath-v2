/**
 * meridianPerf.test.ts — M-13 · The Studiolo · Phase 2 (perf-hardening)
 *
 * PURE, deterministic guards for the §4 performance budget — the part of the
 * budget a cheap in-memory assertion can PROVE without WebGL (the live fps /
 * `gl.info.render.calls` numbers are recorded at the human gate; see
 * `components/world/__tests__/perf.md` § Meridian). These tests pin the invariants
 * the draw-call and window-roll story RELIES on:
 *
 *   1. The tablet freelist cap (`MeridianConfig.tabletCap` = 128, ONE InstancedMesh)
 *      is never approached by the ~28h display window for the §4.4 acceptance seed,
 *      and holds even for an adversarially dense window.
 *   2. All-day bands are capped at `ALLDAY_VISIBLE_CAP` (3) by `visibleSlots`, well
 *      under the band InstancedMesh's 8-slot cap (`MAX_BANDS` in EventTablets.tsx).
 *   3. `resolveOverlaps` NEVER invents tablets: placement count ≤ visible timed
 *      count, lanes stay < `MAX_OVERLAP_LANES`, and every event is accounted for
 *      exactly once (so the freelist demand is bounded by the visible set).
 *   4. `classifyTablet` is monotonic across the T-15 / start / end boundaries —
 *      the property that makes the minute-tick reclassify a rare state flip (so
 *      `aTabletState.needsUpdate` fires seldom, not every idle frame).
 *
 * ZERO `three` / DOM imports — mirror of `meridianLayout.test.ts` discipline; runs
 * in Vitest node env in milliseconds.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";
import {
  solveMeridianLayout,
  visibleSlots,
  classifyTablet,
  resolveOverlaps,
  MERIDIAN_CONFIG_DEFAULTS,
  ALLDAY_VISIBLE_CAP,
  MAX_OVERLAP_LANES,
  WINDOW_HALF_MS,
  MIN_TABLET_SPAN_RAD,
  MS_PER_DAY,
  IMMINENT_MS,
  type TabletSlot,
} from "../meridianLayout";
import { PARCHMENT_HEX } from "../meridianMappings";

const NY = "America/New_York";
const NO_CALS: GcalCalendarMeta[] = [];
const H = 60 * 60 * 1000;

/** The ONE tablet InstancedMesh cap (freelist size) — the number this file guards. */
const TABLET_CAP = MERIDIAN_CONFIG_DEFAULTS.tabletCap; // 128
/**
 * The all-day band InstancedMesh cap. Mirrors `MAX_BANDS` in `EventTablets.tsx`
 * (that module pulls in `three`/R3F, so it cannot be imported into this pure
 * test — the constant is duplicated here and kept in lockstep by intent). The
 * pure `visibleSlots` cap (`ALLDAY_VISIBLE_CAP` = 3) must stay ≤ this.
 */
const MAX_BANDS = 8;

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

afterEach(() => {
  vi.useRealTimers();
});

// ── The §4.4 acceptance seed, built as raw gcal DTOs ─────────────────────────
// 40 events across the 9-day slab (dayOffset −1 … +7) incl. 6 overlapping,
// 2 all-day, and 1 starting in 16 min — the exact seed the perf protocol names.
const NOW_ISO = "2026-07-06T13:45:00-04:00"; // 1:45pm on the demo day
const NOW_MS = Date.parse(NOW_ISO);
const SLAB_START = NOW_MS - 1 * MS_PER_DAY; // startOfDay(today)−1d, approx
const SLAB_END = NOW_MS + 8 * MS_PER_DAY; //   startOfDay(today)+8d, approx

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
/** ISO with the NY offset for the summer demo day (−04:00 EDT all slab days). */
function iso(dayOffset: number, hour: number, min = 0): string {
  const base = new Date(NOW_MS + dayOffset * MS_PER_DAY);
  const y = base.getUTCFullYear();
  // Anchor the civil date off the local (NY) day; the fixed −04:00 offset keeps
  // the seed deterministic without a tz lib in the fixture.
  const local = new Date(Date.parse(NOW_ISO) + dayOffset * MS_PER_DAY);
  const mm = pad(local.getMonth() + 1);
  const dd = pad(local.getDate());
  void y;
  void base;
  return `${local.getFullYear()}-${mm}-${dd}T${pad(hour)}:${pad(min)}:00-04:00`;
}

function acceptanceSeed(): GcalEventDTO[] {
  const events: GcalEventDTO[] = [];
  // 1 event starting in 16 minutes (upcoming, just past the T-15 edge).
  events.push(
    mkEvent({
      id: "in-16",
      title: "Lecture",
      start: new Date(NOW_MS + 16 * 60 * 1000).toISOString(),
      end: new Date(NOW_MS + 76 * 60 * 1000).toISOString(),
    }),
  );
  // 2 all-day events (today + tomorrow).
  events.push(
    mkEvent({ id: "ad-0", allDay: true, start: iso(0, 0).slice(0, 10), end: iso(1, 0).slice(0, 10) }),
    mkEvent({ id: "ad-1", allDay: true, start: iso(1, 0).slice(0, 10), end: iso(2, 0).slice(0, 10) }),
  );
  // 6 overlapping events, all today (two clusters of 3 → merges + lanes).
  for (let k = 0; k < 3; k++) {
    events.push(
      mkEvent({ id: `ovl-a${k}`, start: iso(0, 9, k * 10), end: iso(0, 11) }),
      mkEvent({ id: `ovl-b${k}`, start: iso(0, 16, k * 10), end: iso(0, 18) }),
    );
  }
  // Fill to 40 total with plain, spread, non-overlapping events across the slab.
  let n = events.length;
  for (let day = -1; day <= 7 && n < 40; day++) {
    for (let hour = 8; hour <= 20 && n < 40; hour += 3) {
      events.push({ ...mkEvent({ id: `ev-${day}-${hour}`, start: iso(day, hour), end: iso(day, hour + 1) }) });
      n++;
    }
  }
  return events;
}

// ── 1. Freelist cap headroom (the ≤128 InstancedMesh guarantee) ──────────────
describe("visibleSlots — never exceeds the tablet InstancedMesh cap (128)", () => {
  it("the §4.4 acceptance seed stays FAR under the 128 cap across the whole slab", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
    const { slots } = solveMeridianLayout(acceptanceSeed(), [], NO_CALS, NY);
    expect(slots).toHaveLength(40);

    let maxVisible = 0;
    // Sweep the scrub center hourly across the loaded slab (the full ±7-day
    // scrub range) — the worst case any 28h window can present at once.
    for (let c = SLAB_START; c <= SLAB_END; c += H) {
      const vis = visibleSlots(slots, c, NY);
      maxVisible = Math.max(maxVisible, vis.length);
      expect(vis.length).toBeLessThanOrEqual(TABLET_CAP);
    }
    // The acceptance workload uses a tiny fraction of the freelist — big headroom.
    expect(maxVisible).toBeLessThan(TABLET_CAP / 2);
  });

  it("an adversarially dense window (120 concurrent events) still fits the 128 cap", () => {
    // 120 timed events all overlapping a single 28h window — engineered near the
    // cap to prove `visibleSlots` returns them WITHIN the InstancedMesh's 128
    // slots. (Beyond 128, the freelist is the runtime backstop: EventTablets'
    // `warnCapOnce` skips the overflow — that guard is exercised in the render
    // layer, not here; this asserts the pure window never over-fills on its own.)
    const center = NOW_MS;
    const dense: TabletSlot[] = [];
    for (let i = 0; i < 120; i++) {
      dense.push(
        mkSlot({
          eventId: `d${i}`,
          startMs: center - 2 * H + i * 60_000,
          endMs: center - 2 * H + i * 60_000 + 90 * 60_000,
        }),
      );
    }
    const vis = visibleSlots(dense, center, NY);
    expect(vis.length).toBe(120);
    expect(vis.length).toBeLessThanOrEqual(TABLET_CAP);
  });
});

// ── 2. All-day band cap (≤3 visible, ≤8 band-mesh slots) ─────────────────────
describe("visibleSlots — all-day bands capped well under the 8-slot band mesh", () => {
  it("12 all-day events on one civil day collapse to ≤3 visible bands", () => {
    const center = Date.parse("2026-07-06T12:00:00-04:00");
    const start = Date.parse("2026-07-06T00:00:00-04:00");
    const bands = Array.from({ length: 12 }, (_, k) =>
      mkSlot({
        eventId: `band${k}`,
        allDay: true,
        startMs: start,
        endMs: start + MS_PER_DAY,
      }),
    );
    const visAllDay = visibleSlots(bands, center, NY).filter((s) => s.allDay);
    expect(visAllDay.length).toBe(ALLDAY_VISIBLE_CAP);
    expect(visAllDay.length).toBeLessThanOrEqual(MAX_BANDS);
  });

  it("ALLDAY_VISIBLE_CAP (3) leaves headroom under the band InstancedMesh cap (8)", () => {
    expect(ALLDAY_VISIBLE_CAP).toBeLessThanOrEqual(MAX_BANDS);
  });
});

// ── 3. resolveOverlaps invents nothing (freelist demand is bounded) ──────────
describe("resolveOverlaps — placement count ≤ visible timed count, no event lost", () => {
  function assertPlacementInvariants(timed: TabletSlot[]): void {
    const placements = resolveOverlaps(timed);
    // Never MORE placements than input tablets (merging only ever reduces).
    expect(placements.length).toBeLessThanOrEqual(timed.length);
    // Lanes stay within the ≤2-lane budget (radial offset never runs away).
    for (const p of placements) {
      expect(p.lane).toBeGreaterThanOrEqual(0);
      expect(p.lane).toBeLessThan(MAX_OVERLAP_LANES);
      expect(p.mergedCount).toBe(p.mergedEventIds.length);
    }
    // Every timed event is accounted for EXACTLY once across all placements.
    const folded = placements.flatMap((p) => p.mergedEventIds).sort();
    const expected = timed.map((s) => s.eventId).sort();
    expect(folded).toEqual(expected);
    // Σ mergedCount === input count (no drops, no duplicates).
    const total = placements.reduce((a, p) => a + p.mergedCount, 0);
    expect(total).toBe(timed.length);
  }

  it("holds on the dense adversarial window (120 overlapping tablets)", () => {
    const center = NOW_MS;
    const dense: TabletSlot[] = [];
    for (let i = 0; i < 120; i++) {
      dense.push(
        mkSlot({
          eventId: `d${i}`,
          startMs: center + i * 60_000,
          endMs: center + i * 60_000 + 90 * 60_000,
        }),
      );
    }
    assertPlacementInvariants(dense);
    // A big overlapping cluster merges → far fewer placements than tablets.
    expect(resolveOverlaps(dense).length).toBeLessThan(dense.length);
  });

  it("holds on the §4.4 seed's visible timed set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
    const { slots } = solveMeridianLayout(acceptanceSeed(), [], NO_CALS, NY);
    const timed = visibleSlots(slots, NOW_MS, NY).filter((s) => !s.allDay);
    assertPlacementInvariants(timed);
  });

  it("holds on lanes-only, merge-only, and lone-tablet shapes", () => {
    const t0 = 1_000_000_000_000;
    // two overlapping → 2 placements, lanes {0,1}
    assertPlacementInvariants([
      mkSlot({ eventId: "a", startMs: t0, endMs: t0 + 2 * H }),
      mkSlot({ eventId: "b", startMs: t0 + H, endMs: t0 + 3 * H }),
    ]);
    // three concurrent → 1 merged placement
    assertPlacementInvariants([
      mkSlot({ eventId: "a", startMs: t0, endMs: t0 + 3 * H }),
      mkSlot({ eventId: "b", startMs: t0 + 0.5 * H, endMs: t0 + 2 * H }),
      mkSlot({ eventId: "c", startMs: t0 + H, endMs: t0 + 2.5 * H }),
    ]);
    // two lone → 2 placements, both lane 0
    assertPlacementInvariants([
      mkSlot({ eventId: "a", startMs: t0, endMs: t0 + H }),
      mkSlot({ eventId: "b", startMs: t0 + 2 * H, endMs: t0 + 3 * H }),
    ]);
  });
});

// ── 4. classifyTablet is monotonic (reclassify is a RARE flip, not per-frame) ─
describe("classifyTablet — monotonic across boundaries (cheap minute-tick reclassify)", () => {
  it("sweeping now upward yields upcoming→imminent→current→past with no oscillation", () => {
    const start = 2_000_000_000_000;
    const end = start + 60 * 60 * 1000;
    const slot = mkSlot({ startMs: start, endMs: end });

    // The frozen state ranking (past=0 … current=3 is the aTabletState id, but
    // the TIME-ORDERED progression as `now` advances is upcoming→imminent→
    // current→past). Rank the progression to assert monotonic, single-direction.
    const progressionRank: Record<string, number> = {
      upcoming: 0,
      imminent: 1,
      current: 2,
      past: 3,
    };

    let lastRank = -1;
    let transitions = 0;
    // Walk `now` from 40 min before start to 20 min after end, in 30 s steps.
    for (let now = start - 40 * 60_000; now <= end + 20 * 60_000; now += 30_000) {
      const rank = progressionRank[classifyTablet(slot, now)]!;
      expect(rank).toBeGreaterThanOrEqual(lastRank); // never moves backwards
      if (rank !== lastRank) transitions++;
      lastRank = rank;
    }
    // Exactly the three forward transitions (upcoming→imminent→current→past):
    // proves the state is piecewise-constant with only 3 flips over the event's
    // whole life — the minute-tick reclassify writes `aTabletState` seldom.
    expect(transitions).toBe(4); // includes the initial set from -1 → upcoming
  });

  it("the four states are exhaustive and boundary-exact", () => {
    const now = 1_700_000_000_000;
    const hr = 60 * 60 * 1000;
    expect(classifyTablet(mkSlot({ startMs: now - hr, endMs: now }), now)).toBe("past");
    expect(classifyTablet(mkSlot({ startMs: now, endMs: now + hr }), now)).toBe("current");
    expect(
      classifyTablet(mkSlot({ startMs: now + IMMINENT_MS, endMs: now + IMMINENT_MS + hr }), now),
    ).toBe("imminent");
    expect(
      classifyTablet(mkSlot({ startMs: now + IMMINENT_MS + 1, endMs: now + 2 * hr }), now),
    ).toBe("upcoming");
  });
});

// ── 5. window overlap symmetry (the ±14h roll never leaks) ───────────────────
describe("visibleSlots — the ~28h window (zenith ±14h) is a clean overlap gate", () => {
  it("a slot just outside [center−14h, center+14h] is excluded; just inside is kept", () => {
    const center = NOW_MS;
    const justOutBefore = mkSlot({
      eventId: "out-before",
      startMs: center - WINDOW_HALF_MS - 2 * H,
      endMs: center - WINDOW_HALF_MS - H,
    });
    const justInBefore = mkSlot({
      eventId: "in-before",
      startMs: center - WINDOW_HALF_MS + H,
      endMs: center - WINDOW_HALF_MS + 2 * H,
    });
    expect(visibleSlots([justOutBefore], center, NY)).toHaveLength(0);
    expect(visibleSlots([justInBefore], center, NY).map((s) => s.eventId)).toEqual([
      "in-before",
    ]);
  });
});
