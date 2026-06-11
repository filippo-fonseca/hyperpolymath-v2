/**
 * JARVIS undo — inversion tests (Plan 16-06 Task 2).
 *
 * Verifies that each of the 6 new UndoTarget kinds inverts correctly.
 * Also verifies the cross-user security property on delete_task undo:
 * the inserted row must use the authenticated userId, NOT snapshot.userId.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Error class stubs — hoisted before mocks
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
  getValidGcalToken: vi.fn().mockRejectedValue(new FakeNotConnectedError()),
}));

// ---------------------------------------------------------------------------
// DB mock — tracks calls for assertion
// ---------------------------------------------------------------------------

const { insertCalls, updateCalls, deleteCalls } = vi.hoisted(() => ({
  insertCalls: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updateCalls: [] as Array<{ table: string; set: Record<string, unknown>; where: unknown }>,
  deleteCalls: [] as Array<{ table: string; where: unknown }>,
}));

vi.mock("@/lib/db", () => ({
  db: {
    delete: vi.fn((table: unknown) => {
      const tableName =
        (table && typeof table === "object"
          ? ((table as Record<string | symbol, unknown>)[Symbol.for("drizzle:Name")] as string | undefined) ??
            ((table as Record<string, unknown>)["_"] as Record<string, string> | undefined)?.name
          : undefined) ?? "unknown";
      return {
        where: vi.fn((whereNode: unknown) => {
          deleteCalls.push({ table: tableName, where: whereNode });
          return Promise.resolve({ rowCount: 1 });
        }),
      };
    }),
    update: vi.fn((table: unknown) => {
      const tableName =
        (table && typeof table === "object"
          ? ((table as Record<string | symbol, unknown>)[Symbol.for("drizzle:Name")] as string | undefined) ??
            ((table as Record<string, unknown>)["_"] as Record<string, string> | undefined)?.name
          : undefined) ?? "unknown";
      return {
        set: vi.fn((setValues: unknown) => ({
          where: vi.fn((whereNode: unknown) => {
            updateCalls.push({
              table: tableName,
              set: setValues as Record<string, unknown>,
              where: whereNode,
            });
            return Promise.resolve({ rowCount: 1 });
          }),
        })),
      };
    }),
    insert: vi.fn((table: unknown) => {
      const tableName =
        (table && typeof table === "object"
          ? ((table as Record<string | symbol, unknown>)[Symbol.for("drizzle:Name")] as string | undefined) ??
            ((table as Record<string, unknown>)["_"] as Record<string, string> | undefined)?.name
          : undefined) ?? "unknown";
      return {
        values: vi.fn((values: unknown) => {
          insertCalls.push({ table: tableName, values: values as Record<string, unknown> });
          return Promise.resolve();
        }),
      };
    }),
  },
}));

vi.mock("@/lib/gcal/events", () => ({
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  patchEvent: vi.fn().mockResolvedValue({ data: {} }),
  insertEvent: vi.fn().mockResolvedValue({ data: { id: "new-gcal-id" } }),
  getEvent: vi.fn().mockResolvedValue({ data: {} }),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { undoJarvisActionForUser } from "@/lib/jarvis/undo";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("undoJarvisActionForUser — extended inversion kinds (Plan 16-06)", () => {
  // update_task
  it("update_task: writes before.title back with correct set payload", async () => {
    const taskId = randomUUID();
    const result = await undoJarvisActionForUser(USER_A, {
      kind: "update_task",
      id: taskId,
      before: { title: "old title" },
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toHaveLength(1);
    // The set payload must carry the before values
    expect(updateCalls[0]!.set).toMatchObject({ title: "old title" });
    // Verify the WHERE was constructed (Drizzle SQL object — check it's non-null)
    expect(updateCalls[0]!.where).toBeTruthy();
  });

  // update_capture
  it("update_capture: writes before.content back with correct set payload", async () => {
    const captureId = randomUUID();
    const result = await undoJarvisActionForUser(USER_A, {
      kind: "update_capture",
      id: captureId,
      before: { content: "old content" },
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.set).toMatchObject({ content: "old content" });
    expect(updateCalls[0]!.where).toBeTruthy();
  });

  // delete_task — happy path: inserts with original id and authenticated userId
  it("delete_task: inserts snapshot with original id and session userId", async () => {
    const taskId = randomUUID();
    const snapshot = {
      id: taskId,
      title: "deleted task",
      priority: "P1" as const,
      status: "not started",
      userId: USER_B, // snapshot userId — should be overwritten
    };

    const result = await undoJarvisActionForUser(USER_A, {
      kind: "delete_task",
      snapshot,
    });

    expect(result.ok).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values).toMatchObject({ id: taskId });
    // userId must be USER_A (the authenticated user), NOT snapshot.userId (USER_B)
    expect(insertCalls[0]!.values.userId).toBe(USER_A);
    expect(insertCalls[0]!.values.userId).not.toBe(USER_B);
  });

  // delete_capture — happy path
  it("delete_capture: inserts snapshot with original id and session userId", async () => {
    const captureId = randomUUID();
    const snapshot = {
      id: captureId,
      content: "the deleted capture",
      userId: USER_B, // snapshot userId — should be overwritten
    };

    const result = await undoJarvisActionForUser(USER_A, {
      kind: "delete_capture",
      snapshot,
    });

    expect(result.ok).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values).toMatchObject({ id: captureId });
    expect(insertCalls[0]!.values.userId).toBe(USER_A);
    expect(insertCalls[0]!.values.userId).not.toBe(USER_B);
  });

  // Security property: cross-user undo of delete_task uses the authenticated userId
  it("delete_task: cross-user call — inserted row has caller userId, not snapshot.userId", async () => {
    const taskId = randomUUID();
    // USER_B calls undo with a snapshot that originally had userId USER_A.
    // The inserted row must have userId === USER_B (the session user).
    const result = await undoJarvisActionForUser(USER_B, {
      kind: "delete_task",
      snapshot: {
        id: taskId,
        title: "cross user task",
        priority: "P3" as const,
        status: "not started",
        userId: USER_A, // snapshot has USER_A — but session is USER_B
      },
    });

    expect(result.ok).toBe(true);
    expect(insertCalls[0]!.values.userId).toBe(USER_B);
    expect(insertCalls[0]!.values.userId).not.toBe(USER_A);
  });

  it.todo("update_event invokes patchEvent with before payload");
  it.todo("delete_event invokes insertEvent with snapshot");
});
