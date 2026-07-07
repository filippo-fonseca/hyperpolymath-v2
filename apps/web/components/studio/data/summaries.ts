/**
 * summaries.ts — The Studio · tile-summary projections
 *
 * Pure functions (no React) that project each full slice into a
 * `StudioTileSummary` — the dumb string+badge+state shape the widget-cloud
 * tiles render. Unit-tested in isolation. Every rule here is LOCKED so Wave-2
 * tiles are deterministic; the per-widget hooks wrap these in `useMemo`.
 */
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { toYmd } from "@/lib/tasks/date-shortcuts";
import type {
  CalendarData,
  HabitsData,
  JournalTodayData,
  StudioTileSummary,
} from "./useStudioData";

/** Truncate to ~`max` chars on a single line, collapsing whitespace. */
function truncate(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

// ── Tasks ───────────────────────────────────────────────────────────────────
const PRIORITY_RANK: Record<TaskWithProjects["priority"], number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  "P∞": 3,
};

export function summarizeTasks(
  tasks: TaskWithProjects[],
  todayYmd: string,
): StudioTileSummary {
  const open = tasks.filter((t) => t.status !== "lesno");
  const dueToday = open.filter((t) => t.dueDate === todayYmd).length;

  // Sort: dueDate asc (nulls last), then priority P1<P2<P3<P∞, then kanbanPosition.
  const next = [...open].sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return a.kanbanPosition - b.kanbanPosition;
  })[0];

  return {
    id: "tasks",
    label: "Tasks",
    badge: open.length,
    headline: next ? truncate(next.title) : null,
    subline: dueToday > 0 ? `${dueToday} due today` : null,
    state: open.length === 0 ? "empty" : "ok",
  };
}

// ── Captures ──────────────────────────────────────────────────────────────────
export function summarizeCaptures(
  captures: CaptureWithLinks[],
  todayYmd: string,
): StudioTileSummary {
  // Newest first by createdAt (server returns desc, but sort defensively).
  const newest = [...captures].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  const todayCount = captures.filter(
    (c) => toYmd(c.createdAt) === todayYmd,
  ).length;

  return {
    id: "captures",
    label: "Captures",
    badge: captures.length,
    headline: newest ? truncate(newest.content) : null,
    subline: todayCount > 0 ? `${todayCount} today` : null,
    state: captures.length === 0 ? "empty" : "ok",
  };
}

// ── Agenda ────────────────────────────────────────────────────────────────────
/** Format an ISO/YYYY-MM-DD event start into a short local time label. */
function eventTimeLabel(
  event: { start: string; allDay: boolean },
  timezone: string,
): string {
  if (event.allDay) return "all day";
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(event.start));
  } catch {
    return "";
  }
}

export function summarizeAgenda(
  calendar: CalendarData,
  nowMs: number,
): StudioTileSummary {
  const todayYmdTz = (() => {
    try {
      // `en-CA` gives YYYY-MM-DD directly.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: calendar.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(nowMs));
    } catch {
      return toYmd(new Date(nowMs));
    }
  })();

  // Events on today (timed: start's local day is today; all-day: start date is
  // today) that haven't fully ended yet (end ≥ now). All-day events count for
  // the whole day. In-progress timed events count.
  const isTodayEvent = (e: {
    start: string;
    end: string;
    allDay: boolean;
  }): boolean => {
    if (e.allDay) {
      // All-day: start is YYYY-MM-DD; end is exclusive next-day per gcal.
      return e.start <= todayYmdTz && todayYmdTz < e.end;
    }
    const startDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: calendar.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(e.start));
    const endMs = new Date(e.end).getTime();
    return startDay === todayYmdTz && endMs >= nowMs;
  };

  const remaining = calendar.events.filter(isTodayEvent);

  // Next event: the earliest remaining today event whose start ≥ now, else the
  // current in-progress one (earliest start among remaining).
  const sorted = [...remaining].sort((a, b) => {
    const as = a.allDay ? -Infinity : new Date(a.start).getTime();
    const bs = b.allDay ? -Infinity : new Date(b.start).getTime();
    return as - bs;
  });
  const upcoming = sorted.find(
    (e) => e.allDay || new Date(e.start).getTime() >= nowMs,
  );
  const next = upcoming ?? sorted[0];

  const attention = calendar.status !== "connected";

  return {
    id: "agenda",
    label: "Agenda",
    badge: remaining.length,
    headline: next ? truncate(next.title) : null,
    subline: next ? eventTimeLabel(next, calendar.timezone) : null,
    state: attention ? "attention" : remaining.length === 0 ? "empty" : "ok",
  };
}

// ── Habits ────────────────────────────────────────────────────────────────────
export function summarizeHabits(
  habits: HabitsData,
  todayYmd: string,
): StudioTileSummary {
  // Local day-of-week index for todayYmd (0 = Sunday), matching the 2D client's
  // `parseISODate(selectedDate).getDay()` and `daysOfWeek[dow]` predicate.
  const [y, mo, d] = todayYmd.split("-").map(Number);
  const dow = new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1).getDay();

  const dueToday = habits.habits
    .filter((h) => h.archivedAt === null)
    .filter((h) => h.daysOfWeek[dow] === true);

  const completedToday = new Set(
    habits.completions
      .filter((c) => c.completedDate === todayYmd)
      .map((c) => c.habitId),
  );

  const remaining = dueToday.filter((h) => !completedToday.has(h.id));
  const doneCount = dueToday.length - remaining.length;

  // First incomplete due habit by orderIndex (then name for stability).
  const nextHabit = [...remaining].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  })[0];

  return {
    id: "habits",
    label: "Habits",
    badge: remaining.length,
    headline: nextHabit ? truncate(nextHabit.name) : null,
    subline: dueToday.length > 0 ? `${doneCount}/${dueToday.length} done` : null,
    state: dueToday.length === 0 ? "empty" : "ok",
  };
}

// ── Journal ───────────────────────────────────────────────────────────────────
export function summarizeJournal(journal: JournalTodayData): StudioTileSummary {
  const entry = journal.entry;
  const written = Boolean(entry && (entry.mainResponse ?? "").trim().length > 0);
  const firstLine = written
    ? (entry?.mainResponse ?? "").split("\n").find((l) => l.trim().length > 0) ??
      ""
    : "";

  return {
    id: "journal",
    label: "Journal",
    badge: null,
    headline: written ? truncate(firstLine) : "No entry yet",
    subline: written ? "Written" : null,
    state: written ? "ok" : "empty",
  };
}
