/**
 * suggestCaptureTags — unit tests (#36 / #40).
 *
 * Verifies:
 *   1. Returns parsed suggestions and normalizes `existing` against the vocab.
 *   2. Dedupes case-insensitively and strips a stray leading #.
 *   3. Drops multi-word / empty tags and caps the list at 5.
 *   4. Fails closed (empty list) on a thrown Anthropic call.
 *   5. Short-circuits to [] for empty content without calling the model.
 *
 * Mocks @anthropic-ai/sdk per CLAUDE.md Critical Pattern (Vitest setup §6).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { messagesCreateMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { create: messagesCreateMock };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

// BYOK: suggestCaptureTags now resolves the user's Anthropic key first.
vi.mock("@/lib/byok/keys", () => ({
  getUserKeyOrNull: vi.fn(async () => "sk-ant-test"),
}));

import { suggestCaptureTags } from "@/lib/captures/suggest-tags";

const TEST_USER_ID = "user-1";

function toolResponse(input: unknown) {
  return { content: [{ type: "tool_use", name: "emit_tag_suggestions", input }] };
}

describe("suggestCaptureTags", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    messagesCreateMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns suggestions and marks existing-vocab matches authoritatively", async () => {
    // Model claims `Fitness` is new, but it matches the user's existing `fitness`.
    messagesCreateMock.mockResolvedValue(
      toolResponse({
        tags: [
          { name: "Fitness", existing: false },
          { name: "marathon", existing: false },
        ],
      })
    );
    const out = await suggestCaptureTags(TEST_USER_ID, "ran 8 miles this morning", ["fitness", "reading"]);
    expect(out).toEqual([
      { name: "fitness", existing: true },
      { name: "marathon", existing: false },
    ]);
  });

  it("dedupes case-insensitively, strips leading #, drops multi-word and empties, caps at 5", async () => {
    messagesCreateMock.mockResolvedValue(
      toolResponse({
        tags: [
          { name: "#work", existing: false },
          { name: "Work", existing: false },
          { name: "two words", existing: false },
          { name: "  ", existing: false },
          { name: "a", existing: false },
          { name: "b", existing: false },
          { name: "c", existing: false },
          { name: "d", existing: false },
        ],
      })
    );
    const out = await suggestCaptureTags(TEST_USER_ID, "standup notes", []);
    expect(out.map((t) => t.name)).toEqual(["work", "a", "b", "c", "d"]);
    expect(out).toHaveLength(5);
  });

  it("fails closed to [] when the Anthropic call throws", async () => {
    messagesCreateMock.mockRejectedValue(new Error("boom"));
    const out = await suggestCaptureTags(TEST_USER_ID, "anything", ["x"]);
    expect(out).toEqual([]);
  });

  it("returns [] without calling the model for empty content", async () => {
    const out = await suggestCaptureTags(TEST_USER_ID, "   ", ["x"]);
    expect(out).toEqual([]);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });
});
