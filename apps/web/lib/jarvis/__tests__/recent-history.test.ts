/**
 * recent-history — unit test.
 *
 * Verifies the conversation-memory helper's contract against mocked
 * `jarvis_turns` rows:
 *   - rows returned newest-first by the query are re-ordered oldest-first
 *   - `user` → text, `assistant` → text_delta role/content mapping
 *   - empty-content rows are dropped
 *   - the recency window + row cap are applied at the query layer (asserted via
 *     the where/limit args captured from the mocked query builder)
 *
 * We mock `@/lib/db` with a chainable query-builder stub that records the
 * arguments passed to `.where()` / `.limit()` and resolves the final `await`
 * to a fixed row set — the same shape Drizzle's builder exposes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the args the helper passes through the chainable builder.
const calls: { whereArg: unknown; limitArg: unknown } = { whereArg: undefined, limitArg: undefined };
let mockRows: Array<{
  kind: string;
  text: string | null;
  textDelta: string | null;
  createdAt: Date;
}> = [];

vi.mock("@/lib/db", () => {
  // A thenable chain: select().from().where().orderBy().limit() → Promise<rows>
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.from = () => chain;
    chain.where = (arg: unknown) => {
      calls.whereArg = arg;
      return chain;
    };
    chain.orderBy = () => chain;
    chain.limit = (arg: unknown) => {
      calls.limitArg = arg;
      return Promise.resolve(mockRows);
    };
    return chain;
  };
  return { db: makeChain() };
});

// drizzle-orm operators are called for their SQL args; stub to identity-ish so
// the where clause is constructed without a real connection.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ op: "and", a }),
  eq: (...a: unknown[]) => ({ op: "eq", a }),
  gte: (...a: unknown[]) => ({ op: "gte", a }),
  desc: (c: unknown) => ({ op: "desc", c }),
}));

vi.mock("@/lib/db/schema", () => ({
  jarvisTurns: {
    userId: "user_id",
    kind: "kind",
    text: "text",
    textDelta: "text_delta",
    createdAt: "created_at",
  },
}));

import {
  buildRecentHistory,
  HISTORY_MAX_TURNS,
  HISTORY_WINDOW_MS,
} from "../recent-history";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  calls.whereArg = undefined;
  calls.limitArg = undefined;
  mockRows = [];
});

describe("buildRecentHistory", () => {
  it("maps roles/content and re-orders newest-first rows to oldest-first", async () => {
    // Rows come back newest-first (query orders by createdAt DESC).
    mockRows = [
      { kind: "assistant", text: null, textDelta: "who is 'him', sir?", createdAt: new Date(NOW - 1_000) },
      { kind: "user", text: "no, send him a message", textDelta: null, createdAt: new Date(NOW - 2_000) },
      { kind: "assistant", text: null, textDelta: "shall I send it?", createdAt: new Date(NOW - 3_000) },
      { kind: "user", text: "can you text Rohan?", textDelta: null, createdAt: new Date(NOW - 4_000) },
    ];

    const out = await buildRecentHistory("u1", NOW);

    expect(out).toEqual([
      { role: "user", content: "can you text Rohan?" },
      { role: "assistant", content: "shall I send it?" },
      { role: "user", content: "no, send him a message" },
      { role: "assistant", content: "who is 'him', sir?" },
    ]);
  });

  it("drops rows with empty / whitespace-only content", async () => {
    mockRows = [
      { kind: "assistant", text: null, textDelta: "   ", createdAt: new Date(NOW - 1_000) },
      { kind: "user", text: "", textDelta: null, createdAt: new Date(NOW - 2_000) },
      { kind: "user", text: "real message", textDelta: null, createdAt: new Date(NOW - 3_000) },
      { kind: "assistant", text: null, textDelta: null, createdAt: new Date(NOW - 4_000) },
    ];

    const out = await buildRecentHistory("u1", NOW);

    expect(out).toEqual([{ role: "user", content: "real message" }]);
  });

  it("applies the recency window (cutoff = now - HISTORY_WINDOW_MS) and the row cap", async () => {
    mockRows = [{ kind: "user", text: "hi", textDelta: null, createdAt: new Date(NOW) }];

    await buildRecentHistory("u1", NOW);

    // LIMIT is the max-turns constant.
    expect(calls.limitArg).toBe(HISTORY_MAX_TURNS);

    // The where clause carries a gte(createdAt, cutoff) whose cutoff is
    // now - HISTORY_WINDOW_MS. Dig the Date out of the stubbed gte args.
    const where = calls.whereArg as { op: string; a: unknown[] };
    expect(where.op).toBe("and");
    const gteClause = where.a.find(
      (c) => (c as { op?: string }).op === "gte",
    ) as { op: string; a: unknown[] };
    expect(gteClause).toBeTruthy();
    const cutoff = gteClause.a[1] as Date;
    expect(cutoff.getTime()).toBe(NOW - HISTORY_WINDOW_MS);
  });

  it("returns an empty array when there are no recent turns", async () => {
    mockRows = [];
    const out = await buildRecentHistory("u1", NOW);
    expect(out).toEqual([]);
  });
});
