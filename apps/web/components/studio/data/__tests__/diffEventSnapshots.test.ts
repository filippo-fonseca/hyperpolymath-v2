import { describe, it, expect } from "vitest";
import { diffEventSnapshots } from "../diffing";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";

function mkEvent(id: string, over: Partial<GcalEventDTO> = {}): GcalEventDTO {
  return {
    id,
    calendarId: "primary",
    title: `Event ${id}`,
    start: "2026-07-06T14:00:00-04:00",
    end: "2026-07-06T15:00:00-04:00",
    allDay: false,
    description: null,
    colorId: null,
    recurringEventId: null,
    htmlLink: "",
    ...over,
  };
}

function toMap(rows: GcalEventDTO[]): Map<string, GcalEventDTO> {
  return new Map(rows.map((r) => [r.id, r]));
}

describe("diffEventSnapshots", () => {
  it("reports a newly-appeared event as added (a Jarvis-created event rivets in)", () => {
    const prev = toMap([mkEvent("a"), mkEvent("b")]);
    const next = [mkEvent("a"), mkEvent("b"), mkEvent("c")];
    const diff = diffEventSnapshots(prev, next);
    expect(diff.added).toEqual(["c"]);
    expect(diff.removed).toEqual([]);
  });

  it("reports a vanished event as removed", () => {
    const prev = toMap([mkEvent("a"), mkEvent("b")]);
    const next = [mkEvent("a")];
    const diff = diffEventSnapshots(prev, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual(["b"]);
  });

  it("reports both added and removed in one pass", () => {
    const prev = toMap([mkEvent("a"), mkEvent("b")]);
    const next = [mkEvent("a"), mkEvent("c")];
    const diff = diffEventSnapshots(prev, next);
    expect(diff.added).toEqual(["c"]);
    expect(diff.removed).toEqual(["b"]);
  });

  it("treats a moved/renamed event (same id) as neither added nor removed — it re-poses, it does not spring", () => {
    const prev = toMap([
      mkEvent("a", { title: "Standup", start: "2026-07-06T09:00:00-04:00" }),
    ]);
    // Same id, new time + title — the tablet slides on the dial, no churn.
    const next = [
      mkEvent("a", { title: "Standup (moved)", start: "2026-07-06T11:00:00-04:00" }),
    ];
    const diff = diffEventSnapshots(prev, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("is a no-op for identical snapshots (idempotent across refetches)", () => {
    const rows = [mkEvent("a"), mkEvent("b"), mkEvent("c")];
    const diff = diffEventSnapshots(toMap(rows), rows);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("treats every event as added from an empty prev (first snapshot after seed)", () => {
    const diff = diffEventSnapshots(new Map(), [mkEvent("a"), mkEvent("b")]);
    expect(diff.added).toEqual(["a", "b"]);
    expect(diff.removed).toEqual([]);
  });

  it("treats every event as removed when next is empty (gcal disconnect → []).", () => {
    const prev = toMap([mkEvent("a"), mkEvent("b")]);
    const diff = diffEventSnapshots(prev, []);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual(["a", "b"]);
  });
});
