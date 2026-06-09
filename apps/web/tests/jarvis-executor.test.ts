/**
 * JARVIS executor — Phase 5 Plan 05-02 Task 2.
 *
 * Verifies the load-bearing JARVIS-12 / JARVIS-14 / JARVIS-17 invariants:
 *   1. createTask + createCapture + createEvent NEVER trust `userId` from
 *      input — always use `ctx.userId` (re-derived from getClaims() at the
 *      route boundary).
 *   2. validateProjectIds rejects projectIds belonging to another user OR
 *      non-existent. The executor short-circuits BEFORE any DB write.
 *   3. validateCalendarId rejects calendar_id not in the user's visible
 *      list (or matching default/primary). Short-circuit before gcal call.
 *   4. createCapture writes `created_via: "jarvis"` (D-14) on every row.
 *   5. createCapture upserts hashtags via the existing race-safe helper
 *      (one upsert per tag) and inserts the junction row.
 *   6. createEvent surfaces GcalTokenRevokedError as `{ ok:false, kind:"revoked" }`.
 *
 * Mocks: @/lib/db (in-memory drizzle stub), @/app/actions/hashtags (upsertHashtag),
 * @/lib/gcal/events (createEventForJarvis), @/lib/gcal/token (error classes).
 * No real DB. No real Google.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Error classes (typed) -------------------------------------------------
//
// Hoisted via vi.hoisted so the vi.mock factory below can reference them
// safely (factories run before top-level class declarations).

const { FakeRevokedError, FakeNotConnectedError } = vi.hoisted(() => {
  class FakeRevokedError extends Error {
    readonly kind = "gcal_token_revoked" as const;
    constructor() {
      super("revoked");
      this.name = "GcalTokenRevokedError";
    }
  }
  class FakeNotConnectedError extends Error {
    readonly kind = "gcal_not_connected" as const;
    constructor() {
      super("not connected");
      this.name = "GcalNotConnectedError";
    }
  }
  return { FakeRevokedError, FakeNotConnectedError };
});

vi.mock("@/lib/gcal/token", () => ({
  GcalTokenRevokedError: FakeRevokedError,
  GcalNotConnectedError: FakeNotConnectedError,
}));

// --- DB mock ---------------------------------------------------------------
//
// We expose the underlying spies on the mocked module so tests can:
//   - Stub the SELECT chain return values (project ownership, user calendars)
//   - Inspect captured INSERT/transaction calls
//
// vi.mock factories are hoisted above all imports — use vi.hoisted so the
// shared state object is initialized BEFORE the factory runs.

const { dbState } = vi.hoisted(() => ({
  dbState: {
    selectReturns: [] as unknown[][],
    insertCalls: [] as Array<{ table: unknown; values: unknown }>,
    txnInsertCalls: [] as Array<{ table: unknown; values: unknown }>,
    txnDeleteCalls: [] as Array<{ table: unknown; where: unknown }>,
  },
}));

vi.mock("@/lib/db", () => {
  function makeSelectChain(returnRows: unknown[]) {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(returnRows);
    // Allow await on chain (without .limit) → returns rows
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(returnRows).then(resolve);
    return chain;
  }
  const db = {
    select: vi.fn(() => {
      const rows = dbState.selectReturns.shift() ?? [];
      return makeSelectChain(rows);
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: unknown) => {
        dbState.insertCalls.push({ table, values: vals });
        return Promise.resolve(undefined);
      }),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: vi.fn((table: unknown) => ({
          values: vi.fn((vals: unknown) => {
            dbState.txnInsertCalls.push({ table, values: vals });
            return {
              onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
            };
          }),
        })),
        delete: vi.fn((table: unknown) => ({
          where: vi.fn((w: unknown) => {
            dbState.txnDeleteCalls.push({ table, where: w });
            return Promise.resolve(undefined);
          }),
        })),
      };
      await fn(tx);
    }),
  };
  return { db };
});

// --- gcal events mock ------------------------------------------------------
//
// vi.mock() factories are hoisted ABOVE imports — we use vi.hoisted to
// declare the spy refs so the factory can reference them safely.

const { createEventForJarvisMock, upsertHashtagMock } = vi.hoisted(() => ({
  createEventForJarvisMock: vi.fn(),
  upsertHashtagMock: vi.fn(),
}));

vi.mock("@/lib/gcal/events", () => ({
  createEventForJarvis: createEventForJarvisMock,
}));

vi.mock("@/app/actions/hashtags", () => ({
  upsertHashtag: upsertHashtagMock,
}));

// --- imports under test (deferred — after mocks) ---------------------------

import { createServerExecutor } from "@/lib/jarvis/executor";
import { validateProjectIds, validateCalendarId } from "@/lib/jarvis/validate-references";
import type { ExecutionContext } from "@hyperpolymath/jarvis-core";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const PROJECT_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const CAL_DEFAULT = "primary";
const CAL_VISIBLE = "secondary@group.calendar.google.com";

const ctx: ExecutionContext = {
  userId: USER_A,
  userTimezone: "America/New_York",
  defaultCalendarId: CAL_DEFAULT,
};

beforeEach(() => {
  dbState.selectReturns = [];
  dbState.insertCalls = [];
  dbState.txnInsertCalls = [];
  dbState.txnDeleteCalls = [];
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// validateProjectIds
// ---------------------------------------------------------------------------

describe("validateProjectIds (JARVIS-12 / JARVIS-14)", () => {
  it("empty input → ok with no ids", async () => {
    const result = await validateProjectIds(USER_A, []);
    expect(result.ok).toBe(true);
    expect(result.ids).toEqual([]);
  });

  it("undefined input → ok with no ids", async () => {
    const result = await validateProjectIds(USER_A, undefined);
    expect(result.ok).toBe(true);
    expect(result.ids).toEqual([]);
  });

  it("all ids owned by user → ok with same ids", async () => {
    // SELECT returns both rows
    dbState.selectReturns.push([{ id: PROJECT_A }, { id: PROJECT_B }]);
    const result = await validateProjectIds(USER_A, [PROJECT_A, PROJECT_B]);
    expect(result.ok).toBe(true);
    expect(result.ids.sort()).toEqual([PROJECT_A, PROJECT_B].sort());
    expect(result.rejected).toEqual([]);
  });

  it("one id owned by another user → rejected", async () => {
    // SELECT scoped to USER_A returns only PROJECT_A; PROJECT_B is USER_B's
    dbState.selectReturns.push([{ id: PROJECT_A }]);
    const result = await validateProjectIds(USER_A, [PROJECT_A, PROJECT_B]);
    expect(result.ok).toBe(false);
    expect(result.rejected).toEqual([PROJECT_B]);
  });

  it("non-existent id → rejected", async () => {
    dbState.selectReturns.push([]);
    const result = await validateProjectIds(USER_A, [PROJECT_A]);
    expect(result.ok).toBe(false);
    expect(result.rejected).toEqual([PROJECT_A]);
  });
});

// ---------------------------------------------------------------------------
// validateCalendarId
// ---------------------------------------------------------------------------

describe("validateCalendarId (JARVIS-14)", () => {
  it("null input → falls back to user's default calendar", async () => {
    dbState.selectReturns.push([
      { defaultCalendarId: CAL_DEFAULT, visibleCalendarIds: [CAL_VISIBLE] },
    ]);
    const result = await validateCalendarId(USER_A, null);
    expect(result.ok).toBe(true);
    expect(result.calendarId).toBe(CAL_DEFAULT);
  });

  it("matches default calendar → ok", async () => {
    dbState.selectReturns.push([
      { defaultCalendarId: CAL_DEFAULT, visibleCalendarIds: [CAL_VISIBLE] },
    ]);
    const result = await validateCalendarId(USER_A, CAL_DEFAULT);
    expect(result.ok).toBe(true);
  });

  it("matches visible-list calendar → ok", async () => {
    dbState.selectReturns.push([
      { defaultCalendarId: CAL_DEFAULT, visibleCalendarIds: [CAL_VISIBLE] },
    ]);
    const result = await validateCalendarId(USER_A, CAL_VISIBLE);
    expect(result.ok).toBe(true);
    expect(result.calendarId).toBe(CAL_VISIBLE);
  });

  it("calendar not in visible list → rejected", async () => {
    dbState.selectReturns.push([
      { defaultCalendarId: CAL_DEFAULT, visibleCalendarIds: [CAL_VISIBLE] },
    ]);
    const result = await validateCalendarId(USER_A, "stranger@group.calendar.google.com");
    expect(result.ok).toBe(false);
  });

  it("primary literal always acceptable", async () => {
    dbState.selectReturns.push([
      { defaultCalendarId: null, visibleCalendarIds: null },
    ]);
    const result = await validateCalendarId(USER_A, "primary");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createServerExecutor — createTask
// ---------------------------------------------------------------------------

describe("executor.createTask (JARVIS-12 / JARVIS-14)", () => {
  it("happy path → inserts task with ctx.userId; never trusts input.userId", async () => {
    // Project ownership SELECT returns both
    dbState.selectReturns.push([{ id: PROJECT_A }]);
    const executor = createServerExecutor();
    const result = await executor.createTask(
      {
        title: "Pick up groceries",
        priority: "P1",
        due: "2026-05-14T20:00:00.000Z",
        project_ids: [PROJECT_A],
        // @ts-expect-error — user_id should never appear on the action; if it
        // did, the executor MUST silently ignore it (defense-in-depth).
        user_id: "ATTACKER",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    // Find the tasks insert in the transactional calls
    const taskInsert = dbState.txnInsertCalls.find((c) => {
      const v = c.values as { userId?: string; title?: string };
      return v.title === "Pick up groceries";
    });
    expect(taskInsert).toBeDefined();
    expect((taskInsert!.values as { userId: string }).userId).toBe(USER_A);
    expect((taskInsert!.values as { userId: string }).userId).not.toBe("ATTACKER");
  });

  it("project_id belongs to another user → rejection, no DB write", async () => {
    // PROJECT_B is USER_B's; scoped SELECT returns empty
    dbState.selectReturns.push([]);
    const executor = createServerExecutor();
    const result = await executor.createTask(
      { title: "Sabotage", project_ids: [PROJECT_B] },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("validation");
      expect(result.error).toMatch(PROJECT_B);
    }
    // No transactional inserts for tasks
    const taskInsert = dbState.txnInsertCalls.find((c) => {
      const v = c.values as { title?: string };
      return v.title === "Sabotage";
    });
    expect(taskInsert).toBeUndefined();
  });

  it("priority defaults to P3 (JARVIS-05)", async () => {
    dbState.selectReturns.push([]);
    const executor = createServerExecutor();
    await executor.createTask({ title: "noproj" }, ctx);
    const taskInsert = dbState.txnInsertCalls.find((c) => {
      const v = c.values as { title?: string };
      return v.title === "noproj";
    });
    expect((taskInsert!.values as { priority: string }).priority).toBe("P3");
  });

  it("status defaults to 'not started' (DB enum literal with SPACE)", async () => {
    dbState.selectReturns.push([]);
    const executor = createServerExecutor();
    await executor.createTask({ title: "status-default" }, ctx);
    const taskInsert = dbState.txnInsertCalls.find((c) => {
      const v = c.values as { title?: string };
      return v.title === "status-default";
    });
    expect((taskInsert!.values as { status: string }).status).toBe("not started");
  });
});

// ---------------------------------------------------------------------------
// createServerExecutor — createCapture
// ---------------------------------------------------------------------------

describe("executor.createCapture (D-14, JARVIS-12)", () => {
  it("writes created_via='jarvis' (D-14)", async () => {
    dbState.selectReturns.push([]); // empty project list
    const executor = createServerExecutor();
    const result = await executor.createCapture(
      { content: "random thought" },
      ctx,
    );
    expect(result.ok).toBe(true);
    const captureInsert = dbState.txnInsertCalls.find((c) => {
      const v = c.values as { content?: string };
      return v.content === "random thought";
    });
    expect(captureInsert).toBeDefined();
    expect((captureInsert!.values as { createdVia: string }).createdVia).toBe("jarvis");
    expect((captureInsert!.values as { userId: string }).userId).toBe(USER_A);
  });

  it("upserts hashtags via upsertHashtag (userId FIRST, tx LAST)", async () => {
    dbState.selectReturns.push([]);
    upsertHashtagMock.mockResolvedValue({
      id: "hashtag-1",
      name: "idea",
      displayName: "IDEA",
    });
    const executor = createServerExecutor();
    await executor.createCapture(
      { content: "thought #IDEA", hashtags: ["IDEA"] },
      ctx,
    );
    expect(upsertHashtagMock).toHaveBeenCalledTimes(1);
    // First arg = userId, second = name, third = tx (B2 fix verification)
    const firstCallArgs = upsertHashtagMock.mock.calls[0];
    expect(firstCallArgs[0]).toBe(USER_A);
    expect(firstCallArgs[1]).toBe("IDEA");
    // tx is the third arg — present
    expect(firstCallArgs[2]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createServerExecutor — createEvent
// ---------------------------------------------------------------------------

describe("executor.createEvent (JARVIS-14)", () => {
  it("happy path → calls createEventForJarvis with validated calendar + Date inputs", async () => {
    // validateCalendarId SELECT
    dbState.selectReturns.push([
      { defaultCalendarId: CAL_DEFAULT, visibleCalendarIds: [CAL_VISIBLE] },
    ]);
    createEventForJarvisMock.mockResolvedValue({
      id: "gcal-event-1",
      calendarId: CAL_DEFAULT,
      title: "Dinner",
      description: null,
      start: "2026-05-14T20:00:00.000Z",
      end: "2026-05-14T22:00:00.000Z",
      htmlLink: null,
    });
    const executor = createServerExecutor();
    const result = await executor.createEvent(
      {
        title: "Dinner",
        start: "2026-05-14T20:00:00.000Z",
        end: "2026-05-14T22:00:00.000Z",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(createEventForJarvisMock).toHaveBeenCalledTimes(1);
    const [calledUserId, input] = createEventForJarvisMock.mock.calls[0];
    expect(calledUserId).toBe(USER_A);
    expect(input.start).toBeInstanceOf(Date);
    expect(input.end).toBeInstanceOf(Date);
    expect(input.calendarId).toBe(CAL_DEFAULT);
  });

  it("calendar_id not in visible list → rejection, no gcal call", async () => {
    dbState.selectReturns.push([
      { defaultCalendarId: CAL_DEFAULT, visibleCalendarIds: [CAL_VISIBLE] },
    ]);
    const executor = createServerExecutor();
    const result = await executor.createEvent(
      {
        title: "Sabotage",
        calendar_id: "stranger@group.calendar.google.com",
        start: "2026-05-14T20:00:00.000Z",
        end: "2026-05-14T22:00:00.000Z",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("validation");
    expect(createEventForJarvisMock).not.toHaveBeenCalled();
  });

  it("GcalTokenRevokedError → result kind 'revoked'", async () => {
    dbState.selectReturns.push([
      { defaultCalendarId: CAL_DEFAULT, visibleCalendarIds: [CAL_VISIBLE] },
    ]);
    createEventForJarvisMock.mockRejectedValueOnce(new FakeRevokedError());
    const executor = createServerExecutor();
    const result = await executor.createEvent(
      {
        title: "Dinner",
        start: "2026-05-14T20:00:00.000Z",
        end: "2026-05-14T22:00:00.000Z",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("revoked");
  });

  it("GcalNotConnectedError → result kind 'revoked' (mapped together for UI)", async () => {
    dbState.selectReturns.push([
      { defaultCalendarId: CAL_DEFAULT, visibleCalendarIds: [CAL_VISIBLE] },
    ]);
    createEventForJarvisMock.mockRejectedValueOnce(new FakeNotConnectedError());
    const executor = createServerExecutor();
    const result = await executor.createEvent(
      {
        title: "Dinner",
        start: "2026-05-14T20:00:00.000Z",
        end: "2026-05-14T22:00:00.000Z",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("revoked");
  });
});
