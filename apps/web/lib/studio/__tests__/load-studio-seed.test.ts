import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock every server dependency loadStudioSeed pulls in ────────────────────
const mocks = vi.hoisted(() => ({
  getAllTasksForUser: vi.fn(),
  getCapturesForUser: vi.fn(),
  getGcalConnectionStatus: vi.fn(),
  getHabitsForCurrentUser: vi.fn(),
  getHabitCompletionsInRange: vi.fn(),
  getJournalEntry: vi.fn(),
  getProjectsForCurrentUser: vi.fn(),
  getAreasForCurrentUser: vi.fn(),
  getPeopleForCurrentUser: vi.fn(),
  getValidGcalToken: vi.fn(),
  listCalendars: vi.fn(),
  dbLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.dbLimit }),
      }),
    }),
  },
}));
vi.mock("@/lib/db/schema", () => ({ users: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("@/lib/db/queries/tasks", () => ({
  getAllTasksForUser: mocks.getAllTasksForUser,
}));
vi.mock("@/lib/db/queries/captures", () => ({
  getCapturesForUser: mocks.getCapturesForUser,
}));
vi.mock("@/app/actions/habits", () => ({
  getHabitsForCurrentUser: mocks.getHabitsForCurrentUser,
  getHabitCompletionsInRange: mocks.getHabitCompletionsInRange,
}));
vi.mock("@/app/actions/journal", () => ({
  getJournalEntry: mocks.getJournalEntry,
}));
vi.mock("@/app/actions/projects", () => ({
  getProjectsForCurrentUser: mocks.getProjectsForCurrentUser,
}));
vi.mock("@/app/actions/areas", () => ({
  getAreasForCurrentUser: mocks.getAreasForCurrentUser,
}));
vi.mock("@/app/actions/people", () => ({
  getPeopleForCurrentUser: mocks.getPeopleForCurrentUser,
}));
vi.mock("@/lib/db/queries/gcal-connection", () => ({
  getGcalConnectionStatus: mocks.getGcalConnectionStatus,
}));
vi.mock("@/lib/gcal/token", () => ({
  getValidGcalToken: mocks.getValidGcalToken,
  GcalNotConnectedError: class GcalNotConnectedError extends Error {},
  GcalTokenRevokedError: class GcalTokenRevokedError extends Error {},
}));
vi.mock("@/lib/gcal/calendars", () => ({ listCalendars: mocks.listCalendars }));
vi.mock("@/lib/gcal/event-dto", () => ({
  eventToDTO: (e: { id: string; calendarId?: string }, cid: string) => ({
    id: e.id,
    calendarId: cid,
    title: "e",
    start: "2026-07-07T10:00:00Z",
    end: "2026-07-07T11:00:00Z",
    allDay: false,
    description: null,
    colorId: null,
    recurringEventId: null,
    htmlLink: "",
  }),
}));

import { loadStudioSeed } from "../load-studio-seed";

describe("loadStudioSeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllTasksForUser.mockResolvedValue([{ id: "t1" }]);
    mocks.getCapturesForUser.mockResolvedValue([{ id: "c1" }]);
    mocks.getHabitsForCurrentUser.mockResolvedValue([{ id: "h1" }]);
    mocks.getHabitCompletionsInRange.mockResolvedValue([
      { habitId: "h1", completedDate: "2026-07-07" },
    ]);
    mocks.getJournalEntry.mockResolvedValue({
      success: true,
      data: { id: "j1", mainResponse: "hi" },
    });
    mocks.getProjectsForCurrentUser.mockResolvedValue([{ id: "p1" }]);
    mocks.getAreasForCurrentUser.mockResolvedValue([{ id: "a1" }]);
    mocks.getPeopleForCurrentUser.mockResolvedValue([{ id: "pe1" }]);
    mocks.dbLimit.mockResolvedValue([
      { tz: "America/New_York", visibleCals: null },
    ]);
  });

  it("returns the full StudioSeed shape when gcal is not connected", async () => {
    mocks.getGcalConnectionStatus.mockResolvedValue("not_connected");

    const seed = await loadStudioSeed("u1");

    expect(seed).toMatchObject({
      tasks: [{ id: "t1" }],
      captures: [{ id: "c1" }],
      habits: [{ id: "h1" }],
      habitCompletions: [{ habitId: "h1", completedDate: "2026-07-07" }],
      journal: { id: "j1", mainResponse: "hi" },
      projects: [{ id: "p1" }],
      areas: [{ id: "a1" }],
      people: [{ id: "pe1" }],
    });
    expect(seed.calendar).toMatchObject({
      status: "not_connected",
      events: [],
      calendars: [],
      timezone: "America/New_York",
      visibleCalendarIds: [],
    });
    expect(typeof seed.calendar.windowStartMs).toBe("number");
    expect(typeof seed.calendar.windowEndMs).toBe("number");
    // gcal token is never fetched on the not-connected path.
    expect(mocks.getValidGcalToken).not.toHaveBeenCalled();
  });

  it("resolves the calendar slab when connected", async () => {
    mocks.getGcalConnectionStatus.mockResolvedValue("connected");
    mocks.dbLimit.mockResolvedValue([{ tz: "UTC", visibleCals: ["cal-a"] }]);
    mocks.getValidGcalToken.mockResolvedValue({
      events: {
        list: vi.fn().mockResolvedValue({
          data: { items: [{ id: "ev1" }] },
        }),
      },
    });
    mocks.listCalendars.mockResolvedValue([{ id: "cal-a" }]);

    const seed = await loadStudioSeed("u1");

    expect(seed.calendar.status).toBe("connected");
    expect(seed.calendar.visibleCalendarIds).toEqual(["cal-a"]);
    expect(seed.calendar.events).toHaveLength(1);
    expect(seed.calendar.events[0]!.id).toBe("ev1");
  });

  it("journal null when the entry read fails", async () => {
    mocks.getGcalConnectionStatus.mockResolvedValue("not_connected");
    mocks.getJournalEntry.mockResolvedValue({ success: false, error: "x" });

    const seed = await loadStudioSeed("u1");
    expect(seed.journal).toBeNull();
  });
});
