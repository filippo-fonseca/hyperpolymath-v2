/**
 * Ledger.test.ts — U-11 / M-11 · The Studiolo · labels-ledger
 *
 * The pure `composeLedgerLine` / `composeNextEventClause` / `colloquialTime`
 * surface. The Phase-1 counts behaviour (due today · overdue · unfiled, and the
 * calm "The desk is clear.") is pinned, and the Phase-2 M-11 extension is
 * covered: the colloquial next-event clause appends only when gcal is connected
 * and a timed event still remains TODAY, in the tz-local civil day of `nowMs`.
 */
import { describe, it, expect } from "vitest";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { TreeLayoutResult } from "../../data/treeLayout";
import type { MeridianData, WorldData } from "../../data/useWorldData";
import {
  composeLedgerLine,
  composeNextEventClause,
  colloquialTime,
} from "../Ledger";
import { mkTask } from "../../data/__tests__/_fixtures";

const NY = "America/New_York";
// 2026-07-06 (a Monday) 1:00pm ET — DST, so the offset is −04:00.
const NOW = Date.parse("2026-07-06T13:00:00-04:00");

function mkEvent(over: Partial<GcalEventDTO> = {}): GcalEventDTO {
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

function mkMeridian(over: Partial<MeridianData> = {}): MeridianData {
  return {
    status: over.status ?? "connected",
    events: over.events ?? [],
    calendars: over.calendars ?? [],
    timezone: over.timezone ?? NY,
    windowStartMs: over.windowStartMs ?? 0,
    windowEndMs: over.windowEndMs ?? 0,
  };
}

function mkData(over: {
  tasks?: TaskWithProjects[];
  captureCount?: number;
  todayYmd?: string;
  meridian?: MeridianData;
}): WorldData {
  const captures = new Array(over.captureCount ?? 0).fill(
    null,
  ) as unknown as CaptureWithLinks[];
  return {
    userId: "u",
    tree: [],
    layout: { boughs: [], byProject: new Map() } as unknown as TreeLayoutResult,
    tasks: over.tasks ?? [],
    emberSlots: [],
    captures,
    todayYmd: over.todayYmd ?? "2026-07-06",
    meridian: over.meridian ?? mkMeridian(),
  };
}

// ── The base counts line (Phase-1 behaviour, unchanged) ─────────────────────
describe("composeLedgerLine — base counts", () => {
  it("an empty desk with no gcal clause reads calm", () => {
    const line = composeLedgerLine(
      mkData({ meridian: mkMeridian({ status: "not_connected" }) }),
      NOW,
    );
    expect(line).toBe("The desk is clear.");
  });

  it("counts due-today / overdue / unfiled, omitting overdue when zero", () => {
    const line = composeLedgerLine(
      mkData({
        tasks: [
          mkTask({ status: "in progress", dueDate: "2026-07-06" }),
          mkTask({ status: "not started", dueDate: "2026-07-06" }),
        ],
        captureCount: 3,
        meridian: mkMeridian({ status: "not_connected" }),
      }),
      NOW,
    );
    expect(line).toBe("2 due today  \u00B7  3 unfiled");
  });

  it("shows overdue when present", () => {
    const line = composeLedgerLine(
      mkData({
        tasks: [mkTask({ status: "not started", dueDate: "2026-07-05" })],
        captureCount: 0,
        meridian: mkMeridian({ status: "not_connected" }),
      }),
      NOW,
    );
    expect(line).toBe("0 due today  \u00B7  1 overdue  \u00B7  0 unfiled");
  });
});

// ── The M-11 next-event clause ──────────────────────────────────────────────
describe("composeNextEventClause — the engraved voice", () => {
  it("appends the next timed event today in colloquial hours", () => {
    const clause = composeNextEventClause(
      mkMeridian({
        events: [mkEvent({ title: "Lecture", start: "2026-07-06T14:00:00-04:00" })],
      }),
      NOW,
    );
    expect(clause).toBe("Lecture at two.");
  });

  it("picks the EARLIEST upcoming event today", () => {
    const clause = composeNextEventClause(
      mkMeridian({
        events: [
          mkEvent({ id: "b", title: "Dinner", start: "2026-07-06T18:00:00-04:00" }),
          mkEvent({ id: "a", title: "Lecture", start: "2026-07-06T14:00:00-04:00" }),
        ],
      }),
      NOW,
    );
    expect(clause).toBe("Lecture at two.");
  });

  it("omits the clause when gcal is not connected", () => {
    expect(
      composeNextEventClause(
        mkMeridian({
          status: "not_connected",
          events: [mkEvent({ start: "2026-07-06T14:00:00-04:00" })],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("omits the clause when the token is expired", () => {
    expect(
      composeNextEventClause(
        mkMeridian({
          status: "expired",
          events: [mkEvent({ start: "2026-07-06T14:00:00-04:00" })],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("omits the clause when every event today has already started/passed", () => {
    expect(
      composeNextEventClause(
        mkMeridian({
          events: [
            mkEvent({ start: "2026-07-06T09:00:00-04:00", end: "2026-07-06T10:00:00-04:00" }),
            // ongoing now (start ≤ now < end) — not a "next start after now"
            mkEvent({ start: "2026-07-06T12:30:00-04:00", end: "2026-07-06T13:30:00-04:00" }),
          ],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("omits the clause when the next event is tomorrow (no events remain today)", () => {
    expect(
      composeNextEventClause(
        mkMeridian({
          events: [mkEvent({ start: "2026-07-07T09:00:00-04:00" })],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("ignores all-day events (they carry no colloquial hour)", () => {
    expect(
      composeNextEventClause(
        mkMeridian({
          events: [mkEvent({ allDay: true, start: "2026-07-06", end: "2026-07-07" })],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("falls back to a title when the event summary is blank", () => {
    const clause = composeNextEventClause(
      mkMeridian({
        events: [mkEvent({ title: "   ", start: "2026-07-06T14:00:00-04:00" })],
      }),
      NOW,
    );
    expect(clause).toBe("An event at two.");
  });
});

// ── The full line, clause appended ──────────────────────────────────────────
describe("composeLedgerLine — with the next-event clause", () => {
  it("appends the clause to a clear desk", () => {
    const line = composeLedgerLine(
      mkData({
        meridian: mkMeridian({
          events: [mkEvent({ title: "Lecture", start: "2026-07-06T14:00:00-04:00" })],
        }),
      }),
      NOW,
    );
    expect(line).toBe("The desk is clear.  \u00B7  Lecture at two.");
  });

  it("appends the clause after the counts", () => {
    const line = composeLedgerLine(
      mkData({
        tasks: [mkTask({ status: "in progress", dueDate: "2026-07-06" })],
        captureCount: 2,
        meridian: mkMeridian({
          events: [mkEvent({ title: "Seminar", start: "2026-07-06T15:30:00-04:00" })],
        }),
      }),
      NOW,
    );
    expect(line).toBe("1 due today  \u00B7  2 unfiled  \u00B7  Seminar at half past three.");
  });
});

// ── Colloquial time truth table ─────────────────────────────────────────────
describe("colloquialTime — old-style spoken hours", () => {
  const at = (iso: string) => colloquialTime(Date.parse(iso), NY);

  it("top of the hour → the bare hour word", () => {
    expect(at("2026-07-06T14:00:00-04:00")).toBe("two");
  });
  it("noon and midnight → twelve", () => {
    expect(at("2026-07-06T12:00:00-04:00")).toBe("twelve");
    expect(at("2026-07-06T00:00:00-04:00")).toBe("twelve");
  });
  it("quarter past", () => {
    expect(at("2026-07-06T14:15:00-04:00")).toBe("a quarter past two");
  });
  it("half past", () => {
    expect(at("2026-07-06T14:30:00-04:00")).toBe("half past two");
  });
  it("quarter to the next hour", () => {
    expect(at("2026-07-06T14:45:00-04:00")).toBe("a quarter to three");
  });
  it("minutes before the half → past the current hour", () => {
    expect(at("2026-07-06T14:10:00-04:00")).toBe("ten past two");
  });
  it("minutes after the half → to the next hour", () => {
    expect(at("2026-07-06T14:40:00-04:00")).toBe("twenty to three");
  });
  it("off-mark minutes spell the tens-and-ones", () => {
    expect(at("2026-07-06T14:22:00-04:00")).toBe("twenty-two past two");
    expect(at("2026-07-06T14:38:00-04:00")).toBe("twenty-two to three");
  });
  it("wraps 11 → twelve for a quarter-to at eleven-something", () => {
    expect(at("2026-07-06T11:45:00-04:00")).toBe("a quarter to twelve");
  });
});
