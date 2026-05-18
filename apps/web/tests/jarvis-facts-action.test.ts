/**
 * Task 3 TDD RED — jarvis-facts Server Actions contract tests.
 *
 * Phase 5.1 Plan 05.1-03 (D-M3 / D-M6 / JARVIS-18).
 *
 * Tests:
 *   1. rememberFactAction — authenticated success (upsert returns ok+id)
 *   2. rememberFactAction — unauthenticated returns {ok:false, error:'Unauthorized'}
 *   3. forgetFactAction — authenticated success (delete returns ok)
 *   4. forgetFactAction — row not found (userId mismatch or non-existent) returns {ok:false, error}
 *   5. rememberFactAction — Zod validation rejects unknown type
 *
 * Uses same db mock structure as jarvis-perf-budget.test.ts and
 * jarvis-executor.test.ts. The createClient mock is hoisted to avoid TDZ.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted state: auth mock + db state
// ---------------------------------------------------------------------------

const { getClaimsMock, dbInsertReturns, dbDeleteReturns } = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  dbInsertReturns: { rows: [{ id: "fact-row-id-123" }] as { id: string }[] },
  dbDeleteReturns: { rows: [{ id: "fact-row-id-123" }] as { id: string }[] },
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

// DB mock: insert chain with onConflictDoUpdate + returning
vi.mock("@/lib/db", () => {
  const makeInsertChain = (returnRows: { id: string }[]) => {
    const chain: Record<string, unknown> = {};
    chain.values = vi.fn().mockReturnValue(chain);
    chain.onConflictDoUpdate = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockResolvedValue(returnRows);
    return chain;
  };

  const makeDeleteChain = (returnRows: { id: string }[]) => {
    const chain: Record<string, unknown> = {};
    chain.where = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockResolvedValue(returnRows);
    return chain;
  };

  return {
    db: {
      insert: vi.fn(() => makeInsertChain(dbInsertReturns.rows)),
      delete: vi.fn(() => makeDeleteChain(dbDeleteReturns.rows)),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { rememberFactAction, forgetFactAction } from "@/app/actions/jarvis-facts";

const USER_1 = "11111111-1111-1111-1111-111111111111";
const FACT_UUID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated user
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_1 } },
    error: null,
  });
  // Default: db returns a row id for both insert and delete
  dbInsertReturns.rows = [{ id: "fact-row-id-123" }];
  dbDeleteReturns.rows = [{ id: FACT_UUID }];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("rememberFactAction (JARVIS-18 / D-M3)", () => {
  it("inserts via onConflictDoUpdate and returns {ok:true, id} on success", async () => {
    const result = await rememberFactAction({
      type: "entity",
      key: "Anna",
      value: "partner",
      source: "user_explicit",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBeTruthy();
      expect(typeof result.id).toBe("string");
    }
  });

  it("returns {ok:false, error:'Unauthorized'} when getClaims fails", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: null,
      error: new Error("Session expired"),
    });

    const result = await rememberFactAction({
      type: "entity",
      key: "Anna",
      value: "partner",
      source: "user_explicit",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Unauthorized");
    }
  });

  it("returns {ok:false, error:'Unauthorized'} when claims.sub is missing", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: { claims: {} }, // sub is missing
      error: null,
    });

    const result = await rememberFactAction({
      type: "preference",
      key: "verbosity",
      value: "concise",
      source: "user_explicit",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Unauthorized");
    }
  });

  it("returns {ok:false, error} when Zod validation fails (unknown type)", async () => {
    const result = await rememberFactAction({
      // @ts-expect-error intentionally invalid type for test
      type: "habit",
      key: "morning run",
      value: "daily",
      source: "user_explicit",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("defaults source to 'user_explicit' when not provided", async () => {
    // The schema has .default("user_explicit") so omitting source should work
    const result = await rememberFactAction({
      type: "rule",
      key: "default calendar",
      value: "Yale calendar",
      // source omitted — should default to user_explicit
    } as Parameters<typeof rememberFactAction>[0]);

    expect(result.ok).toBe(true);
  });
});

describe("forgetFactAction (JARVIS-18 / D-M3 / D-M6)", () => {
  it("hard-deletes by (factId, userId) and returns {ok:true} on success", async () => {
    const result = await forgetFactAction({ factId: FACT_UUID });

    expect(result.ok).toBe(true);
  });

  it("returns {ok:false, error:'Fact not found'} when delete returns 0 rows (userId mismatch or non-existent)", async () => {
    // Simulate DB returning no rows (userId mismatch or non-existent factId)
    dbDeleteReturns.rows = [];

    const result = await forgetFactAction({ factId: FACT_UUID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Fact not found");
    }
  });

  it("returns {ok:false, error:'Unauthorized'} when not authenticated", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: null,
      error: new Error("No session"),
    });

    const result = await forgetFactAction({ factId: FACT_UUID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Unauthorized");
    }
  });

  it("returns {ok:false, error} for invalid UUID factId (Zod validation)", async () => {
    const result = await forgetFactAction({ factId: "not-a-uuid" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});
