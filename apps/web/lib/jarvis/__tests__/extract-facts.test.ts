/**
 * extract-facts — unit test.
 *
 * Verifies the Haiku memory-reconciliation side-call:
 *   - a forced reconcile_memory tool result is parsed and each upsert op is
 *     applied with source "jarvis_suggested" via the UNIQUE(user,type,key) path
 *   - a fact whose value already equals the stored value is skipped (no insert)
 *   - an upsert that OVERWRITES an existing key (contradiction) still writes
 *   - a delete op removes the matching fact via db.delete(...).where(...)
 *   - the user's CURRENT MEMORY is fetched and fed into the Haiku prompt
 *   - a delete/db error is swallowed (the function never throws)
 *   - the operations list is capped
 *
 * We mock getAnthropicClient (per the CLAUDE.md guidance to mock the factory,
 * not the SDK internals), mock getJarvisFactsForUser (current memory), and mock
 * @/lib/db with a chainable builder that records inserts + deletes and serves
 * the existing-value lookup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Anthropic client mock -------------------------------------------------
const createMock = vi.fn();
vi.mock("@/lib/jarvis/anthropic-client", () => ({
  HAIKU_MODEL: "haiku-test",
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

// ---- current-memory mock ---------------------------------------------------
const getFactsMock = vi.fn();
vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: (...a: unknown[]) => getFactsMock(...a),
}));

// ---- db mock ---------------------------------------------------------------
// Records insert() values + delete().where() args; serves a configurable
// existing-row lookup. `deleteThrows` forces the delete path to reject.
const insertedValues: Array<Record<string, unknown>> = [];
const deletedWheres: unknown[] = [];
let existingValue: string | undefined; // value the select lookup returns
let deleteThrows = false;

vi.mock("@/lib/db", () => {
  const selectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () =>
      Promise.resolve(existingValue === undefined ? [] : [{ value: existingValue }]);
    return chain;
  };
  const insertChain = () => {
    const chain: Record<string, unknown> = {};
    chain.values = (v: Record<string, unknown>) => {
      insertedValues.push(v);
      return chain;
    };
    chain.onConflictDoUpdate = () => Promise.resolve(undefined);
    return chain;
  };
  const deleteChain = () => {
    const chain: Record<string, unknown> = {};
    chain.where = (w: unknown) => {
      deletedWheres.push(w);
      return deleteThrows ? Promise.reject(new Error("delete boom")) : Promise.resolve(undefined);
    };
    return chain;
  };
  return {
    db: {
      select: () => selectChain(),
      insert: () => insertChain(),
      delete: () => deleteChain(),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  jarvisFacts: {
    userId: "user_id",
    type: "type",
    key: "key",
    value: "value",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ op: "and", a }),
  eq: (...a: unknown[]) => ({ op: "eq", a }),
  desc: (c: unknown) => ({ op: "desc", c }),
  sql: (strings: TemplateStringsArray) => ({ sql: strings.join("") }),
}));

import { extractAndPersistFacts } from "../extract-facts";

/** Wrap ops in a reconcile_memory tool_use response. */
function toolResponse(operations: unknown) {
  return {
    content: [{ type: "tool_use", name: "reconcile_memory", input: { operations } }],
  };
}

/** Legacy helper: build upsert ops from plain fact objects. */
function upserts(facts: Array<{ type: string; key: string; value: string }>) {
  return facts.map((f) => ({ op: "upsert", ...f }));
}

beforeEach(() => {
  createMock.mockReset();
  getFactsMock.mockReset();
  getFactsMock.mockResolvedValue([]); // default: empty current memory
  insertedValues.length = 0;
  deletedWheres.length = 0;
  existingValue = undefined;
  deleteThrows = false;
});

describe("extractAndPersistFacts", () => {
  it("upserts each extracted fact with source jarvis_suggested", async () => {
    createMock.mockResolvedValue(
      toolResponse(upserts([{ type: "entity", key: "rohan.messaging_app", value: "WhatsApp" }])),
    );

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [
        { role: "user", content: "text Rohan" },
        { role: "assistant", content: "which app should I use to reach Rohan?" },
        { role: "user", content: "WhatsApp" },
      ],
    });

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      userId: "u1",
      type: "entity",
      key: "rohan.messaging_app",
      value: "WhatsApp",
      source: "jarvis_suggested",
    });
  });

  it("skips the write when the stored value is already identical", async () => {
    existingValue = "WhatsApp"; // already stored
    createMock.mockResolvedValue(
      toolResponse(upserts([{ type: "entity", key: "rohan.messaging_app", value: "WhatsApp" }])),
    );

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [{ role: "user", content: "text Rohan on WhatsApp" }],
    });

    expect(insertedValues).toHaveLength(0);
  });

  it("overwrites an existing key when the new value contradicts it", async () => {
    // Current memory has WhatsApp; the user now says iMessage.
    getFactsMock.mockResolvedValue([
      {
        type: "entity",
        key: "rohan.messaging_app",
        value: "WhatsApp",
        source: "jarvis_suggested",
        noExport: false,
        updatedAt: new Date(),
        lastUsedAt: null,
      },
    ]);
    existingValue = "WhatsApp"; // stored value differs from the new one
    createMock.mockResolvedValue(
      toolResponse([{ op: "upsert", type: "entity", key: "rohan.messaging_app", value: "iMessage" }]),
    );

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [{ role: "user", content: "actually message Rohan on iMessage from now on" }],
    });

    // Same key, new value → a write happens (overwrite via onConflictDoUpdate).
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      type: "entity",
      key: "rohan.messaging_app",
      value: "iMessage",
    });
  });

  it("deletes a fact that has been retracted", async () => {
    getFactsMock.mockResolvedValue([
      {
        type: "preference",
        key: "workout_time",
        value: "morning",
        source: "jarvis_suggested",
        noExport: false,
        updatedAt: new Date(),
        lastUsedAt: null,
      },
    ]);
    createMock.mockResolvedValue(
      toolResponse([{ op: "delete", type: "preference", key: "workout_time" }]),
    );

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [{ role: "user", content: "forget that I prefer morning workouts" }],
    });

    // No insert; one delete with a where-clause targeting user/type/key.
    expect(insertedValues).toHaveLength(0);
    expect(deletedWheres).toHaveLength(1);
    const where = deletedWheres[0] as { op: string; a: unknown[] };
    expect(where.op).toBe("and");
    // The three eq(...) clauses: user_id, type, key.
    const eqArgs = (where.a as Array<{ a: unknown[] }>).map((c) => c.a);
    expect(eqArgs).toEqual([
      ["user_id", "u1"],
      ["type", "preference"],
      ["key", "workout_time"],
    ]);
  });

  it("ignores a delete for a key not present in current memory", async () => {
    getFactsMock.mockResolvedValue([]); // empty current memory
    createMock.mockResolvedValue(
      toolResponse([{ op: "delete", type: "preference", key: "workout_time" }]),
    );

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [{ role: "user", content: "forget my workout time" }],
    });

    expect(deletedWheres).toHaveLength(0);
  });

  it("fetches current memory and feeds it into the Haiku prompt", async () => {
    getFactsMock.mockResolvedValue([
      {
        type: "entity",
        key: "rohan.messaging_app",
        value: "WhatsApp",
        source: "jarvis_suggested",
        noExport: false,
        updatedAt: new Date(),
        lastUsedAt: null,
      },
    ]);
    createMock.mockResolvedValue(toolResponse([]));

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [{ role: "user", content: "hi" }],
    });

    expect(getFactsMock).toHaveBeenCalledWith("u1");
    const req = createMock.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(req.messages[0].content).toContain("CURRENT MEMORY:");
    expect(req.messages[0].content).toContain("entity/rohan.messaging_app = WhatsApp");
  });

  it("swallows a delete error and never throws", async () => {
    getFactsMock.mockResolvedValue([
      {
        type: "preference",
        key: "workout_time",
        value: "morning",
        source: "jarvis_suggested",
        noExport: false,
        updatedAt: new Date(),
        lastUsedAt: null,
      },
    ]);
    deleteThrows = true;
    createMock.mockResolvedValue(
      toolResponse([{ op: "delete", type: "preference", key: "workout_time" }]),
    );

    await expect(
      extractAndPersistFacts({
        userId: "u1",
        apiKey: "sk-test",
        recentMessages: [{ role: "user", content: "forget morning workouts" }],
      }),
    ).resolves.toBeUndefined();
  });

  it("caps the operations list", async () => {
    // 15 distinct upserts; only the first 10 should be applied.
    const many = Array.from({ length: 15 }, (_, i) => ({
      op: "upsert",
      type: "preference",
      key: `k${i}`,
      value: `v${i}`,
    }));
    createMock.mockResolvedValue(toolResponse(many));

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [{ role: "user", content: "lots of prefs" }],
    });

    expect(insertedValues).toHaveLength(10);
  });

  it("swallows an SDK error and never throws", async () => {
    createMock.mockRejectedValue(new Error("anthropic 500"));

    await expect(
      extractAndPersistFacts({
        userId: "u1",
        apiKey: "sk-test",
        recentMessages: [{ role: "user", content: "hello" }],
      }),
    ).resolves.toBeUndefined();

    expect(insertedValues).toHaveLength(0);
  });

  it("does nothing when there are no non-empty messages or no api key", async () => {
    createMock.mockResolvedValue(toolResponse([]));

    await extractAndPersistFacts({ userId: "u1", apiKey: "", recentMessages: [] });
    expect(createMock).not.toHaveBeenCalled();

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [{ role: "user", content: "   " }],
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });

  it("flattens content-block arrays to text before extraction", async () => {
    createMock.mockResolvedValue(
      toolResponse(upserts([{ type: "preference", key: "meetings.default_length", value: "30 minutes" }])),
    );

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [
        // content-block array shape (as run-turn's loopMessages can carry)
        {
          role: "user",
          content: [{ type: "text", text: "default my meetings to 30 minutes" }] as unknown as string,
        },
      ],
    });

    // The transcript must have been built (create called) and the fact saved.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ key: "meetings.default_length", value: "30 minutes" });
  });
});
