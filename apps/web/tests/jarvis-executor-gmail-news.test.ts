/**
 * JARVIS executor server-side data tools — read_gmail + get_news.
 *
 * Asserts the { ok, receipt } contract that the model narrates from, plus
 * the graceful failure paths (Gmail: token revoked / not connected; News:
 * no API key configured). No DesktopAction is emitted by these tools —
 * they run fully server-side.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerExecutor } from "@/lib/jarvis/executor";
import type { ExecutionContext } from "@hyperpolymath/jarvis-core";

// ---------------------------------------------------------------------------
// Mocks — hollow out anything not exercised by these arms
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({}));
vi.mock("@/lib/gcal/events", () => ({}));

// vi.mock is hoisted — factories must be self-contained. We stash the fn
// references on globalThis so tests can control them.
declare global {
  // eslint-disable-next-line no-var
  var __mockGetAuthedClient: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line no-var
  var __mockMessagesList: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line no-var
  var __mockMessagesGet: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line no-var
  var __mockGetUserKeyOrNull: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line no-var
  var __MockGcalTokenRevokedError: new () => Error;
  // eslint-disable-next-line no-var
  var __MockGcalNotConnectedError: new () => Error;
}
globalThis.__mockGetAuthedClient = vi.fn();
globalThis.__mockMessagesList = vi.fn();
globalThis.__mockMessagesGet = vi.fn();
globalThis.__mockGetUserKeyOrNull = vi.fn();

vi.mock("@/lib/gcal/token", () => {
  class GcalTokenRevokedError extends Error {
    readonly kind = "gcal_token_revoked" as const;
    constructor() {
      super("revoked");
      this.name = "GcalTokenRevokedError";
    }
  }
  class GcalNotConnectedError extends Error {
    readonly kind = "gcal_not_connected" as const;
    constructor() {
      super("not connected");
      this.name = "GcalNotConnectedError";
    }
  }
  globalThis.__MockGcalTokenRevokedError = GcalTokenRevokedError;
  globalThis.__MockGcalNotConnectedError = GcalNotConnectedError;
  return {
    GcalTokenRevokedError,
    GcalNotConnectedError,
    getValidGcalToken: vi.fn(),
    getAuthenticatedGoogleOAuthClient: (userId: string) =>
      globalThis.__mockGetAuthedClient(userId),
  };
});

vi.mock("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        messages: {
          list: (args: unknown) => globalThis.__mockMessagesList(args),
          get: (args: unknown) => globalThis.__mockMessagesGet(args),
        },
      },
    }),
  },
}));

vi.mock("@/lib/byok/keys", () => ({
  getUserKeyOrNull: (userId: string, provider: string) =>
    globalThis.__mockGetUserKeyOrNull(userId, provider),
}));

const mockGetAuthedClient = globalThis.__mockGetAuthedClient;
const mockMessagesList = globalThis.__mockMessagesList;
const mockMessagesGet = globalThis.__mockMessagesGet;
const mockGetUserKeyOrNull = globalThis.__mockGetUserKeyOrNull;

// Peripheral executor deps — hollowed
vi.mock("@/lib/captures/auto-tag", () => ({ scheduleAutoTagging: vi.fn() }));
vi.mock("@/app/actions/hashtags", () => ({ upsertHashtag: vi.fn() }));
vi.mock("@/app/actions/people", () => ({
  reconcilePersonReferencesForUser: vi.fn(),
  resolveOrCreatePersonForUser: vi.fn(),
}));
vi.mock("@/lib/db/queries/people", () => ({ getPeopleForUser: vi.fn() }));
vi.mock("@/lib/jarvis/validate-references", () => ({
  validateCalendarId: vi.fn(),
  validateProjectIds: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared test context
// ---------------------------------------------------------------------------

const ctx: ExecutionContext = {
  userId: "test-user-123",
  userTimezone: "America/New_York",
  defaultCalendarId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// read_gmail
// ---------------------------------------------------------------------------

describe("executor.readGmail", () => {
  it("returns ok:true with parsed messages (from/subject/date/snippet) on success", async () => {
    mockGetAuthedClient.mockResolvedValueOnce({}); // fake auth client
    mockMessagesList.mockResolvedValueOnce({
      data: { messages: [{ id: "m1" }, { id: "m2" }] },
    });
    mockMessagesGet
      .mockResolvedValueOnce({
        data: {
          id: "m1",
          snippet: "Hey — running late.",
          payload: {
            headers: [
              { name: "From", value: "Sam <sam@example.com>" },
              { name: "Subject", value: "quick note" },
              { name: "Date", value: "Wed, 02 Jul 2026 08:00:00 -0400" },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "m2",
          snippet: "Your invoice is attached.",
          payload: {
            headers: [
              { name: "From", value: "billing@company.com" },
              { name: "Subject", value: "Invoice #42" },
              { name: "Date", value: "Wed, 02 Jul 2026 07:30:00 -0400" },
            ],
          },
        },
      });

    const executor = createServerExecutor();
    const result = await executor.readGmail(
      { query: "is:unread", maxResults: 5 },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt).toMatchObject({
      count: 2,
      query: "is:unread",
      messages: [
        {
          from: "Sam <sam@example.com>",
          subject: "quick note",
          snippet: "Hey — running late.",
        },
        {
          from: "billing@company.com",
          subject: "Invoice #42",
          snippet: "Your invoice is attached.",
        },
      ],
    });
    // messages.list must have been called with the query and clamped maxResults
    const listArgs = mockMessagesList.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(listArgs.userId).toBe("me");
    expect(listArgs.q).toBe("is:unread");
    expect(listArgs.maxResults).toBe(5);
  });

  it("clamps maxResults to 25 and defaults to 10 when omitted", async () => {
    mockGetAuthedClient.mockResolvedValueOnce({});
    mockMessagesList.mockResolvedValueOnce({ data: { messages: [] } });

    const executor = createServerExecutor();
    await executor.readGmail({ maxResults: 999 }, ctx);
    const clampedArgs = mockMessagesList.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(clampedArgs.maxResults).toBe(25);

    mockGetAuthedClient.mockResolvedValueOnce({});
    mockMessagesList.mockResolvedValueOnce({ data: { messages: [] } });
    await executor.readGmail({}, ctx);
    const defaultArgs = mockMessagesList.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(defaultArgs.maxResults).toBe(10);
  });

  it("returns ok:false kind:'revoked' with human-friendly copy when the Google token is revoked", async () => {
    mockGetAuthedClient.mockRejectedValueOnce(new globalThis.__MockGcalTokenRevokedError());

    const executor = createServerExecutor();
    const result = await executor.readGmail({}, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.kind).toBe("revoked");
    expect(result.error).toMatch(/reconnect Google/i);
  });

  it("returns ok:false kind:'not_connected' when Google was never connected", async () => {
    mockGetAuthedClient.mockRejectedValueOnce(new globalThis.__MockGcalNotConnectedError());

    const executor = createServerExecutor();
    const result = await executor.readGmail({}, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.kind).toBe("not_connected");
    expect(result.error).toMatch(/connect Google/i);
  });

  it("returns ok:false kind:'revoked' with a 'reconnect for Gmail' hint when the scope is missing", async () => {
    mockGetAuthedClient.mockResolvedValueOnce({});
    mockMessagesList.mockRejectedValueOnce(
      new Error("Request had insufficient authentication scopes."),
    );

    const executor = createServerExecutor();
    const result = await executor.readGmail({}, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.kind).toBe("revoked");
    expect(result.error).toMatch(/Gmail permission/i);
  });
});

// ---------------------------------------------------------------------------
// get_news
// ---------------------------------------------------------------------------

describe("executor.getNews", () => {
  const originalFetch = globalThis.fetch;
  const originalEnvKey = process.env.GUARDIAN_API_KEY;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GUARDIAN_API_KEY;
  });

  it("returns ok:true with normalized article shape when the Guardian API responds", async () => {
    mockGetUserKeyOrNull.mockResolvedValueOnce("user-guardian-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: {
          results: [
            {
              webTitle: "Big story",
              sectionName: "World",
              webPublicationDate: "2026-07-02T08:00:00Z",
              webUrl: "https://www.theguardian.com/world/big-story",
              fields: { trailText: "A big thing happened." },
            },
          ],
        },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const executor = createServerExecutor();
    const result = await executor.getNews({ topic: "world", maxResults: 3 }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt).toMatchObject({
      topic: "world",
      count: 1,
      articles: [
        {
          title: "Big story",
          section: "World",
          published: "2026-07-02T08:00:00Z",
          trailText: "A big thing happened.",
          url: "https://www.theguardian.com/world/big-story",
        },
      ],
    });
    // Verify the URL had the topic and clamped page-size
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("q=world");
    expect(url).toContain("page-size=3");
    expect(url).toContain("api-key=user-guardian-key");
  });

  it("falls back to GUARDIAN_API_KEY env when the user has no BYOK key", async () => {
    mockGetUserKeyOrNull.mockResolvedValueOnce(null);
    process.env.GUARDIAN_API_KEY = "owner-env-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: { results: [] } }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const executor = createServerExecutor();
    const result = await executor.getNews({}, ctx);

    expect(result.ok).toBe(true);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("api-key=owner-env-key");
    // No topic → no q= param
    expect(url).not.toContain("q=");
  });

  it("returns ok:false kind:'not_connected' with a Settings hint when no key is configured anywhere", async () => {
    mockGetUserKeyOrNull.mockResolvedValueOnce(null);
    // no GUARDIAN_API_KEY set in env either

    const executor = createServerExecutor();
    const result = await executor.getNews({ topic: "AI" }, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.kind).toBe("not_connected");
    expect(result.error).toMatch(/Guardian API key/i);
    expect(result.error).toMatch(/open-platform\.theguardian\.com/);
  });

  it("returns ok:false kind:'network' when the Guardian API returns a non-2xx", async () => {
    mockGetUserKeyOrNull.mockResolvedValueOnce("k");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const executor = createServerExecutor();
    const result = await executor.getNews({}, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.kind).toBe("network");
    expect(result.error).toMatch(/Guardian API request failed \(500\)/);
  });
});
