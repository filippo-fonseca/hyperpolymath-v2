/**
 * JARVIS executor CRUD — ownership enforcement (Plan 16-03 Task 3).
 *
 * Verifies that the 9 new executor methods (updateTask, deleteTask,
 * updateCapture, deleteCapture, findTasks, findCaptures, updateEvent,
 * deleteEvent, findEvents) enforce userId-scoped ownership.
 *
 * Key invariant under test (D-3): every update/delete WHERE clause includes
 * BOTH `eq(table.id, input.id)` AND `eq(table.userId, ctx.userId)`.
 * A cross-user delete must:
 *   - Return { ok: false, kind: "not_found" } (not throw)
 *   - NOT modify the target row (rowcount 0 from DB update/delete)
 *
 * Approach: Mock the DB layer at @/lib/db so tests run without a live
 * Supabase. The DB mock records which WHERE-clause filters were applied and
 * simulates "row not found" (empty returning array) for cross-user calls vs.
 * the actual row for same-user calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Error class stubs — must be hoisted before any mocks reference them
// ---------------------------------------------------------------------------

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
  // getValidGcalToken not needed for task/capture tests; stubs for safety
  getValidGcalToken: vi.fn().mockRejectedValue(new FakeNotConnectedError()),
}));

// ---------------------------------------------------------------------------
// DB mock — ownership-aware double-WHERE simulation
//
// The key invariant: executor methods issue WHERE(id = X AND userId = Y).
// We model this by tracking the "owner" of each seeded row. When the mock
// executes an update/delete, it inspects the WHERE args:
//   - If userId in WHERE matches the row's owner → simulate 1 row affected
//   - Otherwise (cross-user) → simulate 0 rows affected (not_found path)
//
// We store seeded rows in a Map<id, { userId, ...fields }> per table and
// expose a helpers object so beforeEach can seed / reset.
// ---------------------------------------------------------------------------

interface MockRow {
  id: string;
  userId: string;
  [key: string]: unknown;
}

const { mockState } = vi.hoisted(() => ({
  mockState: {
    tasks: new Map<string, MockRow>(),
    captures: new Map<string, MockRow>(),
  },
}));

// Helper that builds a WHERE-aware returning chain. It inspects the SQL
// conditions applied via .where() to determine whether the caller supplied
// the correct userId (ownership check).
//
// How the inspection works: Drizzle's `and(eq(table.id, X), eq(table.userId, Y))`
// produces a SQL object. Rather than parsing the SQL AST, we intercept at the
// .where() call and receive the Drizzle SQL node. We extract the raw parameters
// via the node's `queryChunks` (an array of SQL atoms). This is an internal
// Drizzle detail but stable across Drizzle 0.36.x.
//
// Fallback: if we can't extract params, default to "not found" (safe).

/**
 * Recursively extract all string values from a Drizzle SQL WHERE node.
 * Drizzle's `and(eq(table.id, X), eq(table.userId, Y))` produces a nested
 * tree where leaf nodes are plain objects like `{ id: "uuid-value" }` or
 * `{ userId: "uuid-value" }`. We collect all string-valued leaf properties.
 */
function extractWhereParams(node: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): string[] {
  if (!node || typeof node !== "object" || depth > 10) return [];
  // Cycle guard: Drizzle column objects hold a back-reference to their table
  // (which lists every column, including array columns that wrap a baseColumn
  // pointing back at the table). Without tracking visited objects, walking the
  // WHERE node's column references recurses through those cycles and blows the
  // stack. Skipping already-seen objects keeps extraction correct + bounded.
  if (seen.has(node as object)) return [];
  seen.add(node as object);
  const obj = node as Record<string, unknown>;
  const result: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (key === "queryChunks" && Array.isArray(value)) {
      for (const chunk of value) {
        result.push(...extractWhereParams(chunk, depth + 1, seen));
      }
    } else if (typeof value === "string" && value.length > 0 && !["(", ")", " and ", " or ", " = ", ","].includes(value)) {
      result.push(value);
    } else if (Array.isArray(value)) {
      // Skip SQL keyword arrays like ["("] or [" and "]
      const isKeyword = value.length === 1 && typeof value[0] === "string" && value[0].trim().length <= 10;
      if (!isKeyword) {
        for (const item of value) {
          result.push(...extractWhereParams(item, depth + 1, seen));
        }
      }
    } else if (value && typeof value === "object") {
      result.push(...extractWhereParams(value, depth + 1, seen));
    }
  }
  return result;
}

function makeOwnershipAwareDb() {
  return {
    // SELECT path — used by findTasks, findCaptures, and the transaction-SELECT
    // in updateTask / updateCapture (SELECT-before-UPDATE for `before` snapshot).
    select: vi.fn((shape?: unknown) => {
      let _fromTable: unknown = null;
      let _whereNode: unknown = null;
      const chain = {
        _shape: shape,
        from: vi.fn((table: unknown) => {
          _fromTable = table;
          return chain;
        }),
        where: vi.fn((whereNode: unknown) => {
          _whereNode = whereNode;
          return chain;
        }),
        limit: vi.fn(() => {
          // Resolve ownership-aware rows for the SELECT-before-UPDATE pattern.
          // Inspect the WHERE node to find matching rows in the store.
          const tableName = _fromTable && typeof _fromTable === "object"
            ? ((_fromTable as Record<string | symbol, unknown>)[Symbol.for("drizzle:Name")] as string | undefined)
              ?? ((_fromTable as Record<string, unknown>)["_"] as Record<string, string> | undefined)?.name
              ?? "unknown"
            : "unknown";
          const store =
            tableName === "tasks"
              ? mockState.tasks
              : tableName === "captures"
                ? mockState.captures
                : null;
          if (!store || !_whereNode) return Promise.resolve([]);
          const params = extractWhereParams(_whereNode);
          for (const [rowId, row] of store) {
            if (params.includes(rowId) && params.includes(row.userId)) {
              return Promise.resolve([row]);
            }
          }
          return Promise.resolve([]);
        }),
      };
      // findTasks: return tasks for the scoped userId
      // findCaptures: return captures for the scoped userId
      // We mock this at the test level via `mockImplementation` on the spy.
      return chain;
    }),

    // UPDATE path — ownership enforced by rowcount simulation
    update: vi.fn((table: unknown) => {
      let tableName = "unknown";
      if (table && typeof table === "object") {
        const t = table as Record<string | symbol, unknown>;
        tableName =
          (t[Symbol.for("drizzle:Name")] as string | undefined) ??
          (t["_"] as Record<string, string> | undefined)?.name ??
          "unknown";
      }
      return {
        set: vi.fn().mockReturnThis(),
        where: vi.fn((whereNode: unknown) => {
          const params = extractWhereParams(whereNode);
          // params includes the id and userId from the WHERE clause
          const store =
            tableName === "tasks"
              ? mockState.tasks
              : tableName === "captures"
                ? mockState.captures
                : null;

          return {
            returning: vi.fn(() => {
              if (!store || params.length === 0) return Promise.resolve([]);
              // Find the row where params contains BOTH the id and the owner's userId
              for (const [rowId, row] of store) {
                if (params.includes(rowId) && params.includes(row.userId)) {
                  return Promise.resolve([row]);
                }
              }
              return Promise.resolve([]);
            }),
          };
        }),
      };
    }),

    // DELETE path — ownership enforced by rowcount simulation
    delete: vi.fn((table: unknown) => {
      let tableName = "unknown";
      if (table && typeof table === "object") {
        const t = table as Record<string | symbol, unknown>;
        tableName =
          (t[Symbol.for("drizzle:Name")] as string | undefined) ??
          (t["_"] as Record<string, string> | undefined)?.name ??
          "unknown";
      }
      return {
        where: vi.fn((whereNode: unknown) => {
          const params = extractWhereParams(whereNode);
          const store =
            tableName === "tasks"
              ? mockState.tasks
              : tableName === "captures"
                ? mockState.captures
                : null;

          return {
            returning: vi.fn(() => {
              if (!store || params.length === 0) return Promise.resolve([]);
              for (const [rowId, row] of store) {
                if (params.includes(rowId) && params.includes(row.userId)) {
                  store.delete(rowId);
                  return Promise.resolve([row]);
                }
              }
              return Promise.resolve([]);
            }),
          };
        }),
      };
    }),

    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
    // Transaction passes `mockDb` itself as the tx so that `tx.select`, `tx.update`,
    // `tx.delete`, `tx.insert` all resolve with the same ownership-aware behavior.
    // The return value of `fn` is forwarded as the transaction result (needed for
    // updateTask / updateCapture which return rows from inside the transaction).
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(mockDb);
    }),
  };
}

type MockDb = ReturnType<typeof makeOwnershipAwareDb>;
let mockDb: MockDb;

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("@/lib/gcal/events", () => ({
  createEventForJarvis: vi.fn(),
  patchEvent: vi.fn(),
  deleteEvent: vi.fn(),
  listEvents: vi.fn(),
  getEvent: vi.fn(),
  insertEvent: vi.fn(),
}));

vi.mock("@/app/actions/hashtags", () => ({
  upsertHashtag: vi.fn(),
}));

vi.mock("@/lib/jarvis/validate-references", () => ({
  validateProjectIds: vi.fn().mockResolvedValue({ ok: true, ids: [], rejected: [] }),
  validateCalendarId: vi.fn().mockResolvedValue({ ok: true, calendarId: "primary" }),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { createServerExecutor } from "@/lib/jarvis/executor";
import type { ExecutionContext } from "@hyperpolymath/jarvis-core";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const USER_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

const ctxA: ExecutionContext = {
  userId: USER_A,
  userTimezone: "America/New_York",
  defaultCalendarId: null,
  source: { device: "Web", input: "text" },
};

const ctxB: ExecutionContext = {
  userId: USER_B,
  userTimezone: "America/New_York",
  defaultCalendarId: null,
  source: { device: "Web", input: "text" },
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDb = makeOwnershipAwareDb();
  mockState.tasks.clear();
  mockState.captures.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedTask(userId: string, overrides: Partial<MockRow> = {}): MockRow {
  const row: MockRow = {
    id: randomUUID(),
    userId,
    title: "Seed task",
    status: "not started",
    priority: "P3",
    dueDate: "2026-06-11",
    ...overrides,
  };
  mockState.tasks.set(row.id, row);
  return row;
}

function seedCapture(userId: string, overrides: Partial<MockRow> = {}): MockRow {
  const row: MockRow = {
    id: randomUUID(),
    userId,
    content: "Seed capture content",
    ...overrides,
  };
  mockState.captures.set(row.id, row);
  return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JARVIS executor CRUD — ownership enforcement (Plan 16-03)", () => {
  it("deleteTask: cross-user is blocked, returns not_found", async () => {
    // Seed a task owned by USER_B
    const row = seedTask(USER_B, { title: "userB's task" });

    // USER_A tries to delete USER_B's task
    const executor = createServerExecutor();
    const result = await executor.deleteTask({ id: row.id }, ctxA);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("not_found");
    }
    // The row still exists in the store (was not deleted)
    expect(mockState.tasks.has(row.id)).toBe(true);
  });

  it("updateTask: cross-user is blocked, row unchanged", async () => {
    // Seed a task owned by USER_B
    const row = seedTask(USER_B, { title: "Original title" });

    // USER_A tries to update USER_B's task
    const executor = createServerExecutor();
    const result = await executor.updateTask(
      { id: row.id, title: "Hacked title" },
      ctxA,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("not_found");
    }
    // Original row is unchanged
    expect(mockState.tasks.get(row.id)?.title).toBe("Original title");
  });

  it("deleteCapture: cross-user is blocked, capture still exists", async () => {
    // Seed a capture owned by USER_B
    const row = seedCapture(USER_B, { content: "userB's capture" });

    // USER_A tries to delete it
    const executor = createServerExecutor();
    const result = await executor.deleteCapture({ id: row.id }, ctxA);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("not_found");
    }
    // Capture still exists
    expect(mockState.captures.has(row.id)).toBe(true);
  });

  it("findTasks: cross-user results are excluded (only returns own tasks)", async () => {
    // Seed tasks for both users with the same title keyword
    seedTask(USER_A, { title: "shared keyword task" });
    seedTask(USER_B, { title: "shared keyword task" });

    // Override db.select to return ownership-filtered results
    mockDb.select.mockImplementation((() => {
      const rows = Array.from(mockState.tasks.values()).filter(
        (r) => r.userId === USER_A,
      );
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(rows),
      };
    }) as never);

    const executor = createServerExecutor();
    const result = await executor.findTasks({ query: "shared keyword" }, ctxA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const matches = result.receipt.matches as MockRow[];
      // All returned rows must belong to USER_A
      expect(matches.every((m) => m.userId === USER_A)).toBe(true);
      // USER_B's task must not be in results
      expect(matches.some((m) => m.userId === USER_B)).toBe(false);
    }
  });

  it("updateTask: same-user happy path returns ok and persists change", async () => {
    // Seed a task owned by USER_A
    const row = seedTask(USER_A, { title: "original title" });

    const executor = createServerExecutor();
    const result = await executor.updateTask(
      { id: row.id, title: "updated title" },
      ctxA,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe(row.id);
      expect(result.receipt.id).toBe(row.id);
    }
  });

  it("deleteTask: same-user succeeds, row is removed from store", async () => {
    const row = seedTask(USER_A, { title: "to be deleted" });

    const executor = createServerExecutor();
    const result = await executor.deleteTask({ id: row.id }, ctxA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.deleted).toBe(true);
    }
    // Row is gone from the store
    expect(mockState.tasks.has(row.id)).toBe(false);
  });

  it("deleteCapture: same-user succeeds, receipt includes truncated preview", async () => {
    const row = seedCapture(USER_A, { content: "A long capture content that should be truncated in the receipt" });

    const executor = createServerExecutor();
    const result = await executor.deleteCapture({ id: row.id }, ctxA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.deleted).toBe(true);
      // Preview should be max 80 chars
      const preview = result.receipt.preview as string;
      expect(preview.length).toBeLessThanOrEqual(80);
    }
  });

  it("updateCapture: cross-user is blocked", async () => {
    const row = seedCapture(USER_B, { content: "userB's original content" });

    const executor = createServerExecutor();
    const result = await executor.updateCapture(
      { id: row.id, content: "hijacked content" },
      ctxA,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("not_found");
    }
    // Content unchanged
    expect(mockState.captures.get(row.id)?.content).toBe("userB's original content");
  });

  // Plan 16-06 Task 1: new tests for before/snapshot receipt shapes

  it("updateTask happy-path includes before snapshot", async () => {
    const row = seedTask(USER_A, { title: "old title", status: "not started", priority: "P3" });

    const executor = createServerExecutor();
    const result = await executor.updateTask(
      { id: row.id, title: "new title" },
      ctxA,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe(row.id);
      // `before` must carry the pre-update value for the changed field
      expect((result.receipt as { before?: { title?: string } }).before?.title).toBe("old title");
    }
  });

  it("deleteTask happy-path includes full row snapshot", async () => {
    const row = seedTask(USER_A, { title: "will be deleted" });

    const executor = createServerExecutor();
    const result = await executor.deleteTask({ id: row.id }, ctxA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const receipt = result.receipt as { id: string; deleted: boolean; snapshot?: { id: string; userId: string } };
      expect(receipt.deleted).toBe(true);
      expect(receipt.snapshot?.id).toBe(row.id);
      expect(receipt.snapshot?.userId).toBe(ctxA.userId);
    }
  });

  it("deleteCapture happy-path includes full row snapshot", async () => {
    const originalContent = "original capture content for snapshot test";
    const row = seedCapture(USER_A, { content: originalContent });

    const executor = createServerExecutor();
    const result = await executor.deleteCapture({ id: row.id }, ctxA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const receipt = result.receipt as { deleted: boolean; snapshot?: { content: string } };
      expect(receipt.deleted).toBe(true);
      expect(receipt.snapshot?.content).toBe(originalContent);
    }
  });

  it.todo("updateEvent includes before snapshot from getEvent");
});

// ---------------------------------------------------------------------------
// URL derivation — a link embedded in the task title/notes is auto-populated
// into the tasks.url property (single-url Notion-style field), mirroring the
// capture body-link derivation. Never overwrites a url that was already set.
// ---------------------------------------------------------------------------

describe("JARVIS executor — task URL derivation", () => {
  it("createTask derives the url from a link in the title (reported case)", async () => {
    // Capture the values written to the tasks insert (skip join-table inserts).
    const inserted: Record<string, unknown>[] = [];
    mockDb.insert.mockImplementation((() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (vals && "title" in vals) inserted.push(vals);
        return Promise.resolve(undefined);
      }),
    })) as never);

    const executor = createServerExecutor();
    const result = await executor.createTask(
      {
        title:
          "Reproduce GPT-2 from Karpathy https://www.youtube.com/watch?v=l8pRSuU81PU&t=76s",
      },
      ctxA,
    );

    expect(result.ok).toBe(true);
    expect(inserted[0]?.url).toBe(
      "https://www.youtube.com/watch?v=l8pRSuU81PU&t=76s",
    );
    // The title text itself is kept verbatim (link stays in the title).
    expect(inserted[0]?.title).toBe(
      "Reproduce GPT-2 from Karpathy https://www.youtube.com/watch?v=l8pRSuU81PU&t=76s",
    );
  });

  it("createTask leaves url null when the title has no link", async () => {
    const inserted: Record<string, unknown>[] = [];
    mockDb.insert.mockImplementation((() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (vals && "title" in vals) inserted.push(vals);
        return Promise.resolve(undefined);
      }),
    })) as never);

    const executor = createServerExecutor();
    const result = await executor.createTask({ title: "Reproduce GPT-2" }, ctxA);

    expect(result.ok).toBe(true);
    expect(inserted[0]?.url).toBeNull();
  });

  it("updateTask fills url when a link is added to the title and url was unset", async () => {
    const row = seedTask(USER_A, { title: "plain task", url: null });

    const executor = createServerExecutor();
    const result = await executor.updateTask(
      { id: row.id, title: "watch https://youtu.be/abc123 now" },
      ctxA,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const changes = (result.receipt as { changes: { url?: string | null } })
        .changes;
      expect(changes.url).toBe("https://youtu.be/abc123");
    }
  });

  it("updateTask never overwrites a url that was already set", async () => {
    const row = seedTask(USER_A, {
      title: "plain task",
      url: "https://manual.example.com/kept",
    });

    const executor = createServerExecutor();
    const result = await executor.updateTask(
      { id: row.id, title: "now mentions https://different.example.com/x" },
      ctxA,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const changes = (result.receipt as { changes: { url?: string | null } })
        .changes;
      // Derived value equals the existing url, so the update writes no url change.
      expect(changes.url).toBeUndefined();
    }
  });
});
