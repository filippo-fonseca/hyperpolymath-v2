/**
 * listEventsForUser() — the read-only Server Action backing the calendar grid.
 *
 * Phase 4 Plan 04-03 (CAL-07, Pitfall 10).
 *
 * Three tests:
 *   1. happy path — getValidGcalToken returns a Calendar with events.list
 *      returning TWO pages of items (verifies pageToken loop), assert that:
 *        - the merged DTO array contains all items from both pages,
 *        - `singleEvents: true` was passed (Pitfall 10),
 *        - `timeZone: "America/New_York"` was passed (Pitfall 10 — DST).
 *   2. revoked path — getValidGcalToken throws GcalTokenRevokedError; the
 *      action surfaces `{ success: false, kind: "revoked" }` without
 *      rethrowing (UI uses `kind` to drive the DisconnectBanner).
 *   3. not_connected path — same shape with `kind: "not_connected"` for
 *      EmptyState.
 *
 * Mock surface:
 *   - `@/lib/db`               — db.select for users.timezone lookup
 *   - `@/lib/auth/get-user`    — requireOnboarded returns a user
 *   - `@/lib/gcal/token`       — getValidGcalToken stub + error classes re-exported
 *
 * No real DB. No real Google. CI-safe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- DB mock --------------------------------------------------------------
//
// Only one chain we care about: db.select().from(users).where().limit(1)
// returning [{ tz: "America/New_York" }]. We rebuild the chain per-call so
// each test can swap the returned row freely.

const dbState: { selectResult: unknown[] } = { selectResult: [] };

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockImplementation(() => Promise.resolve(dbState.selectResult));
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
  },
}));

// --- auth ---------------------------------------------------------------

vi.mock("@/lib/auth/get-user", () => ({
  requireOnboarded: vi.fn(async () => ({
    id: "user-1",
    email: "filippo@example.com",
    graduationYear: null,
    onboardedAt: new Date(),
  })),
}));

// --- gcal token + errors -----------------------------------------------
//
// We mock the entire @/lib/gcal/token module. The action imports the error
// classes from this module too — we re-export them so `instanceof` checks
// inside the action still resolve to the SAME classes the test throws.

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

const getValidGcalTokenMock = vi.fn();
// events.list mock — overridable per test.
const eventsListMock = vi.fn();
const calendarStub = { events: { list: eventsListMock } };

vi.mock("@/lib/gcal/token", () => ({
  getValidGcalToken: getValidGcalTokenMock,
  GcalTokenRevokedError: FakeRevokedError,
  GcalNotConnectedError: FakeNotConnectedError,
  GcalTokenRefreshError: class extends Error {},
}));

// --- harness ------------------------------------------------------------

beforeEach(() => {
  dbState.selectResult = [{ tz: "America/New_York" }];
  getValidGcalTokenMock.mockReset();
  eventsListMock.mockReset();
  getValidGcalTokenMock.mockResolvedValue(calendarStub);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function callList(input: {
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
}) {
  const mod = await import("@/app/actions/gcal-events");
  return mod.listEventsForUser(input);
}

// --- tests --------------------------------------------------------------

describe("listEventsForUser — happy path", () => {
  it("pages through multiple result pages, passes singleEvents+timeZone, returns merged DTOs", async () => {
    // Two pages: first has nextPageToken, second has none.
    eventsListMock
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "evt-1",
              summary: "Standup",
              start: { dateTime: "2026-05-12T10:00:00-04:00" },
              end: { dateTime: "2026-05-12T10:30:00-04:00" },
            },
            {
              id: "evt-2",
              summary: "Lunch",
              start: { dateTime: "2026-05-12T12:00:00-04:00" },
              end: { dateTime: "2026-05-12T13:00:00-04:00" },
            },
          ],
          nextPageToken: "PAGE2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "evt-3",
              summary: "All-hands",
              start: { dateTime: "2026-05-12T15:00:00-04:00" },
              end: { dateTime: "2026-05-12T16:00:00-04:00" },
            },
          ],
          nextPageToken: undefined,
        },
      });

    const result = await callList({
      calendarIds: ["primary"],
      timeMin: "2026-05-11T00:00:00-04:00",
      timeMax: "2026-05-18T00:00:00-04:00",
    });

    expect(result.success).toBe(true);
    if (!result.success) return; // narrowing for TS
    expect(result.data).toHaveLength(3);
    expect(result.data.map((e) => e.id)).toEqual(["evt-1", "evt-2", "evt-3"]);

    // Pitfall 10 — both flags MUST be on every call.
    expect(eventsListMock).toHaveBeenCalledTimes(2);
    for (const call of eventsListMock.mock.calls) {
      const arg = call[0] as Record<string, unknown>;
      expect(arg.singleEvents).toBe(true);
      expect(arg.timeZone).toBe("America/New_York");
      expect(arg.orderBy).toBe("startTime");
      expect(arg.calendarId).toBe("primary");
    }

    // Second call carries the nextPageToken from the first.
    const firstCall = eventsListMock.mock.calls[0]![0] as Record<string, unknown>;
    const secondCall = eventsListMock.mock.calls[1]![0] as Record<string, unknown>;
    expect(firstCall.pageToken).toBeUndefined();
    expect(secondCall.pageToken).toBe("PAGE2");
  });
});

describe("listEventsForUser — revoked path", () => {
  it("returns { success: false, kind: 'revoked' } when getValidGcalToken throws GcalTokenRevokedError", async () => {
    getValidGcalTokenMock.mockRejectedValueOnce(new FakeRevokedError());

    const result = await callList({
      calendarIds: ["primary"],
      timeMin: "2026-05-11T00:00:00-04:00",
      timeMax: "2026-05-18T00:00:00-04:00",
    });

    expect(result).toEqual({
      success: false,
      error: "Reconnect Google Calendar",
      kind: "revoked",
    });
    // events.list never invoked because token resolution failed.
    expect(eventsListMock).not.toHaveBeenCalled();
  });
});

describe("listEventsForUser — not_connected path", () => {
  it("returns { success: false, kind: 'not_connected' } when getValidGcalToken throws GcalNotConnectedError", async () => {
    getValidGcalTokenMock.mockRejectedValueOnce(new FakeNotConnectedError());

    const result = await callList({
      calendarIds: ["primary"],
      timeMin: "2026-05-11T00:00:00-04:00",
      timeMax: "2026-05-18T00:00:00-04:00",
    });

    expect(result).toEqual({
      success: false,
      error: "Not connected",
      kind: "not_connected",
    });
    expect(eventsListMock).not.toHaveBeenCalled();
  });
});
