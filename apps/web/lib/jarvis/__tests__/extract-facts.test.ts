/**
 * extract-facts — unit test.
 *
 * Verifies the Haiku fact-extraction side-call:
 *   - a forced extract_facts tool result is parsed and each fact upserted with
 *     source "jarvis_suggested" via the UNIQUE(user,type,key) upsert path
 *   - a fact whose value already equals the stored value is skipped (no insert)
 *   - an SDK error is swallowed (the function never throws)
 *
 * We mock getAnthropicClient (per the CLAUDE.md guidance to mock the factory,
 * not the SDK internals) and mock @/lib/db with a chainable builder that
 * records inserts and serves the existing-value lookup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Anthropic client mock -------------------------------------------------
const createMock = vi.fn();
vi.mock("@/lib/jarvis/anthropic-client", () => ({
  HAIKU_MODEL: "haiku-test",
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

// ---- db mock ---------------------------------------------------------------
// Records insert() values; serves a configurable existing-row lookup.
const insertedValues: Array<Record<string, unknown>> = [];
let existingValue: string | undefined; // value the select lookup returns

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
  return {
    db: {
      select: () => selectChain(),
      insert: () => insertChain(),
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
  sql: (strings: TemplateStringsArray) => ({ sql: strings.join("") }),
}));

import { extractAndPersistFacts } from "../extract-facts";

function toolResponse(facts: unknown) {
  return {
    content: [{ type: "tool_use", name: "extract_facts", input: { facts } }],
  };
}

beforeEach(() => {
  createMock.mockReset();
  insertedValues.length = 0;
  existingValue = undefined;
});

describe("extractAndPersistFacts", () => {
  it("upserts each extracted fact with source jarvis_suggested", async () => {
    createMock.mockResolvedValue(
      toolResponse([{ type: "entity", key: "rohan.messaging_app", value: "WhatsApp" }]),
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
      toolResponse([{ type: "entity", key: "rohan.messaging_app", value: "WhatsApp" }]),
    );

    await extractAndPersistFacts({
      userId: "u1",
      apiKey: "sk-test",
      recentMessages: [{ role: "user", content: "text Rohan on WhatsApp" }],
    });

    expect(insertedValues).toHaveLength(0);
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
      toolResponse([{ type: "preference", key: "meetings.default_length", value: "30 minutes" }]),
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
