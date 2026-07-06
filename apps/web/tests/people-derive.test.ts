/**
 * lib/people/derive — unit tests for the linked-people smart-match.
 *
 * Verifies the two pieces that carry the correctness burden:
 *   1. `filterResolvedPersonIds` — the hard hallucination guard: only ids the
 *      user actually owns survive, de-duplicated and capped.
 *   2. `matchExistingPeopleInContent` — the Haiku entity-resolution step:
 *      resolves a confident partial reference ("Anna" → "Anna Parker"), leaves
 *      ambiguous/absent references unresolved, drops hallucinated ids, and
 *      fails SOFT (empty list, never throws) on empty content, missing BYOK
 *      key, empty roster, or a thrown model call — so background derivation can
 *      never break a write path.
 *
 * Mocks @anthropic-ai/sdk per CLAUDE.md Critical Pattern (Vitest §6). The DB /
 * server-only deps are stubbed purely so importing the module doesn't require a
 * live Postgres connection — none of the functions under test touch them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { messagesCreateMock, getUserKeyOrNullMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
  getUserKeyOrNullMock: vi.fn(async () => "sk-ant-test" as string | null),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { create: messagesCreateMock };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

vi.mock("@/lib/byok/keys", () => ({
  getUserKeyOrNull: getUserKeyOrNullMock,
}));

// Importing derive.ts pulls in the db client + server-only helpers at module
// load; stub them so the test never needs DATABASE_URL / a real connection.
// The functions under test do not exercise these.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/app/actions/people", () => ({
  reconcilePersonReferencesForUser: vi.fn(async () => undefined),
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

import {
  filterResolvedPersonIds,
  matchExistingPeopleInContent,
  type KnownPerson,
} from "@/lib/people/derive";

const USER = "user-1";

function toolResponse(input: unknown) {
  return { content: [{ type: "tool_use", name: "emit_person_matches", input }] };
}

const ROSTER: KnownPerson[] = [
  { id: "p-anna", name: "Anna Parker" },
  { id: "p-ben", name: "Ben Adams" },
  { id: "p-cara", name: "Cara Lopez" },
];

describe("filterResolvedPersonIds", () => {
  it("keeps only ids the user owns, dropping hallucinated/unknown ids", () => {
    const out = filterResolvedPersonIds(["p-anna", "p-ghost", "p-ben"], ROSTER);
    expect(out).toEqual(["p-anna", "p-ben"]);
  });

  it("de-dupes repeated ids preserving first-seen order", () => {
    const out = filterResolvedPersonIds(["p-ben", "p-ben", "p-anna"], ROSTER);
    expect(out).toEqual(["p-ben", "p-anna"]);
  });

  it("caps the number of matches at the hard backstop (12)", () => {
    const known: KnownPerson[] = Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i}`,
      name: `Person ${i}`,
    }));
    const candidates = known.map((p) => p.id);
    const out = filterResolvedPersonIds(candidates, known);
    expect(out).toHaveLength(12);
    expect(out[0]).toBe("p-0");
  });

  it("returns [] when nothing matches the roster", () => {
    expect(filterResolvedPersonIds(["x", "y"], ROSTER)).toEqual([]);
  });
});

describe("matchExistingPeopleInContent", () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
    getUserKeyOrNullMock.mockResolvedValue("sk-ant-test");
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a confident partial reference to an existing person", async () => {
    messagesCreateMock.mockResolvedValue(toolResponse({ person_ids: ["p-anna"] }));
    const out = await matchExistingPeopleInContent(USER, "coffee with Anna at 3", ROSTER);
    expect(out).toEqual(["p-anna"]);
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
  });

  it("drops ids the model hallucinates that aren't in the roster", async () => {
    messagesCreateMock.mockResolvedValue(
      toolResponse({ person_ids: ["p-anna", "p-does-not-exist"] }),
    );
    const out = await matchExistingPeopleInContent(USER, "note about Anna and someone", ROSTER);
    expect(out).toEqual(["p-anna"]);
  });

  it("leaves ambiguous references unresolved (model returns empty)", async () => {
    messagesCreateMock.mockResolvedValue(toolResponse({ person_ids: [] }));
    const out = await matchExistingPeopleInContent(USER, "lunch with a friend", ROSTER);
    expect(out).toEqual([]);
  });

  it("short-circuits to [] for empty content without calling the model", async () => {
    const out = await matchExistingPeopleInContent(USER, "   ", ROSTER);
    expect(out).toEqual([]);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it("returns [] without calling the model when the user has no people", async () => {
    const out = await matchExistingPeopleInContent(USER, "hello Anna", []);
    expect(out).toEqual([]);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it("degrades to [] (no model call) when the user has no BYOK key", async () => {
    getUserKeyOrNullMock.mockResolvedValue(null);
    const out = await matchExistingPeopleInContent(USER, "hi Anna", ROSTER);
    expect(out).toEqual([]);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it("fails soft to [] when the Anthropic call throws", async () => {
    messagesCreateMock.mockRejectedValue(new Error("boom"));
    const out = await matchExistingPeopleInContent(USER, "Anna Parker was here", ROSTER);
    expect(out).toEqual([]);
  });

  it("returns [] when the response has no tool_use block", async () => {
    messagesCreateMock.mockResolvedValue({ content: [{ type: "text", text: "nope" }] });
    const out = await matchExistingPeopleInContent(USER, "Anna", ROSTER);
    expect(out).toEqual([]);
  });

  it("returns [] when the tool input fails schema validation", async () => {
    messagesCreateMock.mockResolvedValue(toolResponse({ person_ids: "not-an-array" }));
    const out = await matchExistingPeopleInContent(USER, "Anna", ROSTER);
    expect(out).toEqual([]);
  });
});
