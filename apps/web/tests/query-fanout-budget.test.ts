/**
 * Round-trip budget for the list-page query helpers (u3, issue #350).
 *
 * getAllTasksForUser, getCapturesForUser and getPagesForUser each fetch a row
 * set and then fan out to link tables keyed on the ids they just read. Those
 * fan-out queries depend on the id list and on nothing else, so they belong in
 * one wave: dispatched together, awaited together. Written serially they cost
 * the sum of their round trips instead of the max.
 *
 * "Waves" is what this measures. The db mock records how many statements are
 * in flight at once, so a Promise.all wave of three shows up as a peak of
 * three and a serial chain shows up as a peak of one. It also records the
 * total statement count, which must not change: this is a scheduling fix, not
 * a query-shape one.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { tracker } = vi.hoisted(() => ({
  tracker: {
    inFlight: 0,
    peakInFlight: 0,
    statements: 0,
    /** Rows handed to the Nth statement; anything past the end resolves []. */
    queue: [] as unknown[][],
  },
}));

/**
 * Minimal stand-in for a Drizzle query builder: every chaining method returns
 * itself, and awaiting it resolves on a later macrotask. The delay is what
 * makes concurrency observable — a serial chain can never overlap.
 */
function makeBuilder() {
  const builder: Record<string, unknown> = {};
  for (const method of [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "groupBy",
  ]) {
    builder[method] = () => builder;
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => {
    const index = tracker.statements;
    tracker.statements += 1;
    tracker.inFlight += 1;
    tracker.peakInFlight = Math.max(tracker.peakInFlight, tracker.inFlight);
    return new Promise((r) => setTimeout(() => r(tracker.queue[index] ?? []), 0))
      .then((rows) => {
        tracker.inFlight -= 1;
        return rows;
      })
      .then(resolve, reject);
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: () => makeBuilder(),
  },
}));

import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { getPagesForUser } from "@/lib/db/queries/pages";

const USER = "11111111-1111-4111-8111-111111111111";

function reset(firstRows: unknown[]) {
  tracker.inFlight = 0;
  tracker.peakInFlight = 0;
  tracker.statements = 0;
  tracker.queue = [firstRows];
}

describe("list-page query fan-out", () => {
  beforeEach(() => {
    reset([]);
  });

  it("getAllTasksForUser issues its three link queries in one wave", async () => {
    reset([{ id: "task-1", title: "t", status: "not started" }]);

    await getAllTasksForUser(USER);

    // 1 row query + 3 link queries, unchanged.
    expect(tracker.statements).toBe(4);
    // The three link queries overlap: two waves, not four.
    expect(tracker.peakInFlight).toBe(3);
  });

  it("getCapturesForUser issues its three link queries in one wave", async () => {
    reset([{ id: "capture-1", content: "c", urls: [] }]);

    await getCapturesForUser(USER);

    expect(tracker.statements).toBe(4);
    expect(tracker.peakInFlight).toBe(3);
  });

  it("getPagesForUser issues its three dependent queries in one wave", async () => {
    reset([{ id: "page-1", title: "p" }]);

    await getPagesForUser(USER);

    // 1 row query + project links + field definitions + field values. The
    // folder parent map is skipped when no folder-scoped definition exists.
    expect(tracker.statements).toBe(4);
    expect(tracker.peakInFlight).toBe(3);
  });
});
