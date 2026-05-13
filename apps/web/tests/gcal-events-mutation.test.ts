/**
 * `createEvent` / `updateEvent` / `deleteEvent` — Phase 4 Plan 04-04 Task 1.
 *
 * Five tests covering the mutation Server Actions:
 *   1. createEvent — calls events.insert with the canonical requestBody shape
 *      (summary/description/start/end with timeZone), returns the canonical
 *      DTO mapped via eventToDTO.
 *   2. createEvent — revoked → `{ success: false, kind: "revoked" }`.
 *   3. updateEvent (calendarId unchanged) — calls events.patch only, never
 *      events.move.
 *   4. updateEvent (calendarId CHANGED) — calls events.move FIRST, then
 *      events.patch on the destination calendar. Ordering enforced via
 *      `invocationCallOrder`.
 *   5. deleteEvent — calls events.delete with { calendarId, eventId },
 *      returns `{ success: true, data: { id } }`.
 *
 * Mock surface:
 *   - `@/lib/db`               — db.select chain for users.timezone (not
 *     strictly needed for mutations but the action imports it for shared
 *     auth/init paths)
 *   - `@/lib/auth/get-user`    — requireOnboarded returns a user
 *   - `@/lib/gcal/token`       — getValidGcalToken returns a Calendar stub
 *     with events.{insert, patch, delete, move}; error classes re-exported
 *     so `instanceof` checks inside the action resolve to the same classes
 *     the test throws.
 *
 * No real DB. No real Google. CI-safe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- DB mock (minimal — used only for any incidental SELECT) ---------------

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue([{ tz: "America/New_York" }]);
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
  },
}));

// --- auth -------------------------------------------------------------------

vi.mock("@/lib/auth/get-user", () => ({
  requireOnboarded: vi.fn(async () => ({
    id: "user-1",
    email: "filippo@example.com",
    graduationYear: null,
    onboardedAt: new Date(),
  })),
}));

// --- gcal token + errors ---------------------------------------------------

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
const eventsInsertMock = vi.fn();
const eventsPatchMock = vi.fn();
const eventsDeleteMock = vi.fn();
const eventsMoveMock = vi.fn();

const calendarStub = {
  events: {
    insert: eventsInsertMock,
    patch: eventsPatchMock,
    delete: eventsDeleteMock,
    move: eventsMoveMock,
  },
};

vi.mock("@/lib/gcal/token", () => ({
  getValidGcalToken: getValidGcalTokenMock,
  GcalTokenRevokedError: FakeRevokedError,
  GcalNotConnectedError: FakeNotConnectedError,
  GcalTokenRefreshError: class extends Error {},
}));

// --- harness ---------------------------------------------------------------

beforeEach(() => {
  getValidGcalTokenMock.mockReset();
  eventsInsertMock.mockReset();
  eventsPatchMock.mockReset();
  eventsDeleteMock.mockReset();
  eventsMoveMock.mockReset();
  getValidGcalTokenMock.mockResolvedValue(calendarStub);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function callCreate(input: Record<string, unknown>) {
  const mod = await import("@/app/actions/gcal-events");
  return mod.createEvent(input);
}
async function callUpdate(input: Record<string, unknown>) {
  const mod = await import("@/app/actions/gcal-events");
  return mod.updateEvent(input);
}
async function callDelete(input: Record<string, unknown>) {
  const mod = await import("@/app/actions/gcal-events");
  return mod.deleteEvent(input);
}

// --- tests -----------------------------------------------------------------

describe("createEvent — happy path", () => {
  it("calls events.insert with canonical requestBody and returns mapped DTO", async () => {
    const canonicalId = "abc123def456ghi789jkl0";
    eventsInsertMock.mockResolvedValueOnce({
      data: {
        id: canonicalId,
        summary: "Phase 4 smoke",
        description: "test",
        start: { dateTime: "2026-05-12T14:00:00-04:00" },
        end: { dateTime: "2026-05-12T15:00:00-04:00" },
        htmlLink: "https://calendar.google.com/event?eid=abc",
      },
    });

    const result = await callCreate({
      calendarId: "primary",
      title: "Phase 4 smoke",
      description: "test",
      start: "2026-05-12T14:00:00-04:00",
      end: "2026-05-12T15:00:00-04:00",
      allDay: false,
      userTimezone: "America/New_York",
    });

    expect(result.success).toBe(true);
    if (!result.success) return; // TS narrow
    expect(result.data.id).toBe(canonicalId);
    expect(result.data.calendarId).toBe("primary");

    expect(eventsInsertMock).toHaveBeenCalledTimes(1);
    const arg = eventsInsertMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.calendarId).toBe("primary");
    const requestBody = arg.requestBody as Record<string, unknown>;
    expect(requestBody.summary).toBe("Phase 4 smoke");
    expect(requestBody.description).toBe("test");
    expect(requestBody.start).toEqual({
      dateTime: "2026-05-12T14:00:00-04:00",
      timeZone: "America/New_York",
    });
    expect(requestBody.end).toEqual({
      dateTime: "2026-05-12T15:00:00-04:00",
      timeZone: "America/New_York",
    });
  });
});

describe("createEvent — revoked path", () => {
  it("returns { success: false, kind: 'revoked' } when getValidGcalToken throws revoked", async () => {
    getValidGcalTokenMock.mockRejectedValueOnce(new FakeRevokedError());

    const result = await callCreate({
      calendarId: "primary",
      title: "Phase 4 smoke",
      start: "2026-05-12T14:00:00-04:00",
      end: "2026-05-12T15:00:00-04:00",
      allDay: false,
      userTimezone: "America/New_York",
    });

    expect(result.success).toBe(false);
    if (result.success) return; // TS narrow
    expect(result.kind).toBe("revoked");
    expect(eventsInsertMock).not.toHaveBeenCalled();
  });
});

describe("updateEvent — calendarId unchanged (events.patch only)", () => {
  it("calls events.patch; does NOT call events.move when newCalendarId === currentCalendarId", async () => {
    const eventId = "evt-canonical-id";
    eventsPatchMock.mockResolvedValueOnce({
      data: {
        id: eventId,
        summary: "Phase 4 EDITED",
        description: "updated",
        start: { dateTime: "2026-05-12T14:30:00-04:00" },
        end: { dateTime: "2026-05-12T15:30:00-04:00" },
        htmlLink: "https://calendar.google.com/event?eid=abc",
      },
    });

    const result = await callUpdate({
      eventId,
      currentCalendarId: "primary",
      newCalendarId: "primary",
      title: "Phase 4 EDITED",
      description: "updated",
      start: "2026-05-12T14:30:00-04:00",
      end: "2026-05-12T15:30:00-04:00",
      allDay: false,
      userTimezone: "America/New_York",
    });

    expect(result.success).toBe(true);
    expect(eventsMoveMock).not.toHaveBeenCalled();
    expect(eventsPatchMock).toHaveBeenCalledTimes(1);
    const arg = eventsPatchMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.calendarId).toBe("primary");
    expect(arg.eventId).toBe(eventId);
    const requestBody = arg.requestBody as Record<string, unknown>;
    expect(requestBody.summary).toBe("Phase 4 EDITED");
  });
});

describe("updateEvent — calendarId CHANGED (events.move BEFORE events.patch)", () => {
  it("calls events.move first, then events.patch on the destination calendar", async () => {
    const eventId = "evt-canonical-id";
    eventsMoveMock.mockResolvedValueOnce({ data: { id: eventId } });
    eventsPatchMock.mockResolvedValueOnce({
      data: {
        id: eventId,
        summary: "Moved + Edited",
        start: { dateTime: "2026-05-12T14:30:00-04:00" },
        end: { dateTime: "2026-05-12T15:30:00-04:00" },
        htmlLink: "https://calendar.google.com/event?eid=abc",
      },
    });

    const result = await callUpdate({
      eventId,
      currentCalendarId: "primary",
      newCalendarId: "other-calendar-id",
      title: "Moved + Edited",
      start: "2026-05-12T14:30:00-04:00",
      end: "2026-05-12T15:30:00-04:00",
      allDay: false,
      userTimezone: "America/New_York",
    });

    expect(result.success).toBe(true);
    expect(eventsMoveMock).toHaveBeenCalledTimes(1);
    expect(eventsPatchMock).toHaveBeenCalledTimes(1);

    // events.move called with correct args.
    const moveArg = eventsMoveMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(moveArg.calendarId).toBe("primary");
    expect(moveArg.eventId).toBe(eventId);
    expect(moveArg.destination).toBe("other-calendar-id");

    // events.patch on the destination calendar.
    const patchArg = eventsPatchMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(patchArg.calendarId).toBe("other-calendar-id");
    expect(patchArg.eventId).toBe(eventId);

    // Ordering — move BEFORE patch.
    const moveOrder = eventsMoveMock.mock.invocationCallOrder[0]!;
    const patchOrder = eventsPatchMock.mock.invocationCallOrder[0]!;
    expect(moveOrder).toBeLessThan(patchOrder);
  });
});

describe("deleteEvent — happy path", () => {
  it("calls events.delete with { calendarId, eventId } and returns success", async () => {
    eventsDeleteMock.mockResolvedValueOnce({ data: "" });

    const result = await callDelete({
      calendarId: "primary",
      eventId: "evt-canonical-id",
    });

    expect(result).toEqual({ success: true, data: { id: "evt-canonical-id" } });
    expect(eventsDeleteMock).toHaveBeenCalledTimes(1);
    const arg = eventsDeleteMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.calendarId).toBe("primary");
    expect(arg.eventId).toBe("evt-canonical-id");
  });
});
