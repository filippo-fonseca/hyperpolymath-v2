import { describe, it, expect } from "vitest";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { HabitWithAreas } from "@/app/actions/habits";
import type { JournalEntry } from "@/app/actions/journal";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type {
  CalendarData,
  HabitsData,
  JournalTodayData,
} from "../useStudioData";
import {
  summarizeAgenda,
  summarizeCaptures,
  summarizeHabits,
  summarizeJournal,
  summarizeTasks,
} from "../summaries";

const TODAY = "2026-07-07";

// ── Minimal typed fixture factories ─────────────────────────────────────────
function task(over: Partial<TaskWithProjects> = {}): TaskWithProjects {
  return {
    id: over.id ?? "t1",
    title: "Task",
    priority: "P3",
    status: "not started",
    dueDate: null,
    kanbanPosition: 0,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    projects: [],
    ...over,
  } as TaskWithProjects;
}

function capture(over: Partial<CaptureWithLinks> = {}): CaptureWithLinks {
  return {
    id: over.id ?? "c1",
    content: "note",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    favorite: false,
    ...over,
  } as CaptureWithLinks;
}

function habit(over: Partial<HabitWithAreas> = {}): HabitWithAreas {
  return {
    id: over.id ?? "h1",
    userId: "u1",
    name: "Habit",
    emoji: null,
    orderIndex: 0,
    daysOfWeek: [true, true, true, true, true, true, true],
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    areas: [],
    ...over,
  } as HabitWithAreas;
}

function habitsData(
  habits: HabitWithAreas[],
  completions: { habitId: string; completedDate: string }[] = [],
): HabitsData {
  return { habits, completions, windowStart: "2026-06-24" };
}

function event(over: Partial<GcalEventDTO> = {}): GcalEventDTO {
  return {
    id: over.id ?? "e1",
    calendarId: "primary",
    title: "Event",
    start: `${TODAY}T14:00:00Z`,
    end: `${TODAY}T15:00:00Z`,
    allDay: false,
    description: null,
    colorId: null,
    recurringEventId: null,
    htmlLink: "",
    ...over,
  };
}

function calendar(over: Partial<CalendarData> = {}): CalendarData {
  return {
    status: "connected",
    events: [],
    calendars: [],
    timezone: "UTC",
    windowStartMs: 0,
    windowEndMs: 0,
    ...over,
  };
}

function journal(entry: JournalEntry | null): JournalTodayData {
  return { entry };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
describe("summarizeTasks", () => {
  it("empty state when no open tasks", () => {
    const s = summarizeTasks([task({ status: "lesno" })], TODAY);
    expect(s.badge).toBe(0);
    expect(s.headline).toBeNull();
    expect(s.state).toBe("empty");
  });

  it("counts open tasks and due-today", () => {
    const s = summarizeTasks(
      [
        task({ id: "a", dueDate: TODAY }),
        task({ id: "b", dueDate: TODAY }),
        task({ id: "c", dueDate: null }),
        task({ id: "d", status: "lesno", dueDate: TODAY }),
      ],
      TODAY,
    );
    expect(s.badge).toBe(3);
    expect(s.subline).toBe("2 due today");
    expect(s.state).toBe("ok");
  });

  it("null subline when nothing due today", () => {
    const s = summarizeTasks([task({ dueDate: "2026-08-01" })], TODAY);
    expect(s.subline).toBeNull();
  });

  it("headline picks earliest due, then priority, then kanbanPosition", () => {
    const s = summarizeTasks(
      [
        task({ id: "far", title: "Far", dueDate: "2026-07-10" }),
        task({ id: "undated", title: "Undated", dueDate: null }),
        task({ id: "soon-p3", title: "SoonP3", dueDate: TODAY, priority: "P3" }),
        task({ id: "soon-p1", title: "SoonP1", dueDate: TODAY, priority: "P1" }),
      ],
      TODAY,
    );
    expect(s.headline).toBe("SoonP1");
  });

  it("nulls-last: dated beats undated", () => {
    const s = summarizeTasks(
      [
        task({ id: "u", title: "Undated", dueDate: null, priority: "P1" }),
        task({ id: "d", title: "Dated", dueDate: "2026-07-20", priority: "P3" }),
      ],
      TODAY,
    );
    expect(s.headline).toBe("Dated");
  });
});

// ── Captures ──────────────────────────────────────────────────────────────────
describe("summarizeCaptures", () => {
  it("empty state", () => {
    const s = summarizeCaptures([], TODAY);
    expect(s.badge).toBe(0);
    expect(s.headline).toBeNull();
    expect(s.state).toBe("empty");
  });

  it("headline is newest by createdAt; today count", () => {
    const s = summarizeCaptures(
      [
        capture({
          id: "old",
          content: "old",
          createdAt: new Date("2026-07-01T09:00:00"),
        }),
        capture({
          id: "new",
          content: "newest thing",
          createdAt: new Date(`${TODAY}T09:00:00`),
        }),
      ],
      TODAY,
    );
    expect(s.headline).toBe("newest thing");
    expect(s.badge).toBe(2);
    expect(s.subline).toBe("1 today");
  });

  it("truncates long content to a single line", () => {
    const long = "x".repeat(200);
    const s = summarizeCaptures([capture({ content: long })], TODAY);
    expect(s.headline!.length).toBeLessThanOrEqual(60);
    expect(s.headline!.endsWith("…")).toBe(true);
  });
});

// ── Agenda ────────────────────────────────────────────────────────────────────
describe("summarizeAgenda", () => {
  const nowMs = new Date(`${TODAY}T12:00:00Z`).getTime();

  it("attention when gcal not connected", () => {
    const s = summarizeAgenda(
      calendar({ status: "expired", events: [event()] }),
      nowMs,
    );
    expect(s.state).toBe("attention");
  });

  it("empty when connected with no remaining events", () => {
    const s = summarizeAgenda(calendar({ status: "connected" }), nowMs);
    expect(s.state).toBe("empty");
    expect(s.badge).toBe(0);
  });

  it("counts remaining today events (incl. in-progress) and picks next", () => {
    const s = summarizeAgenda(
      calendar({
        events: [
          event({
            id: "past",
            title: "Past",
            start: `${TODAY}T09:00:00Z`,
            end: `${TODAY}T10:00:00Z`,
          }),
          event({
            id: "inprog",
            title: "InProgress",
            start: `${TODAY}T11:30:00Z`,
            end: `${TODAY}T12:30:00Z`,
          }),
          event({
            id: "later",
            title: "Later",
            start: `${TODAY}T15:00:00Z`,
            end: `${TODAY}T16:00:00Z`,
          }),
        ],
      }),
      nowMs,
    );
    // past ended before now → excluded; in-progress + later remain
    expect(s.badge).toBe(2);
    // upcoming (start ≥ now) preferred → "Later"; else in-progress
    expect(s.headline).toBe("Later");
  });

  it("falls back to in-progress when no upcoming event remains", () => {
    const s = summarizeAgenda(
      calendar({
        events: [
          event({
            id: "inprog",
            title: "OnlyInProgress",
            start: `${TODAY}T11:30:00Z`,
            end: `${TODAY}T13:00:00Z`,
          }),
        ],
      }),
      nowMs,
    );
    expect(s.badge).toBe(1);
    expect(s.headline).toBe("OnlyInProgress");
  });

  it("counts all-day events and labels them", () => {
    const s = summarizeAgenda(
      calendar({
        timezone: "UTC",
        events: [
          event({
            id: "allday",
            title: "AllDay",
            start: TODAY,
            end: "2026-07-08",
            allDay: true,
          }),
        ],
      }),
      nowMs,
    );
    expect(s.badge).toBe(1);
    expect(s.headline).toBe("AllDay");
    expect(s.subline).toBe("all day");
  });
});

// ── Habits ────────────────────────────────────────────────────────────────────
describe("summarizeHabits", () => {
  it("empty when nothing due today", () => {
    // 2026-07-07 is a Tuesday → getDay() === 2. daysOfWeek all false.
    const s = summarizeHabits(
      habitsData([habit({ daysOfWeek: new Array(7).fill(false) })]),
      TODAY,
    );
    expect(s.state).toBe("empty");
    expect(s.badge).toBe(0);
  });

  it("x/y done math and remaining badge", () => {
    const due = [
      habit({ id: "a", name: "Alpha", orderIndex: 1 }),
      habit({ id: "b", name: "Beta", orderIndex: 0 }),
      habit({ id: "c", name: "Gamma", orderIndex: 2 }),
    ];
    const s = summarizeHabits(
      habitsData(due, [{ habitId: "a", completedDate: TODAY }]),
      TODAY,
    );
    expect(s.subline).toBe("1/3 done");
    expect(s.badge).toBe(2);
    // first incomplete due habit by orderIndex → Beta (0)
    expect(s.headline).toBe("Beta");
  });

  it("excludes archived habits", () => {
    const s = summarizeHabits(
      habitsData([
        habit({ id: "arch", archivedAt: new Date("2026-01-01T00:00:00Z") }),
      ]),
      TODAY,
    );
    expect(s.state).toBe("empty");
  });
});

// ── Journal ───────────────────────────────────────────────────────────────────
describe("summarizeJournal", () => {
  it("empty when no entry", () => {
    const s = summarizeJournal(journal(null));
    expect(s.state).toBe("empty");
    expect(s.headline).toBe("No entry yet");
    expect(s.badge).toBeNull();
  });

  it("ok with first line of mainResponse", () => {
    const s = summarizeJournal(
      journal({
        mainResponse: "First line here\nsecond line",
        notesSection: null,
      } as JournalEntry),
    );
    expect(s.state).toBe("ok");
    expect(s.headline).toBe("First line here");
    expect(s.subline).toBe("Written");
  });

  it("treats blank mainResponse as no entry", () => {
    const s = summarizeJournal(
      journal({ mainResponse: "   ", notesSection: null } as JournalEntry),
    );
    expect(s.state).toBe("empty");
    expect(s.headline).toBe("No entry yet");
  });
});
