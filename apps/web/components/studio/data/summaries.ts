/**
 * summaries.ts — The Studio · tile-summary projections
 *
 * Pure functions (no React) that project each full slice into a
 * `StudioTileSummary` — the dumb string+badge+state+lines shape the widget-cloud
 * tiles render. Unit-tested in isolation. Every rule here is LOCKED so tiles
 * are deterministic; the per-widget hooks wrap these in `useMemo`.
 */
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { ProjectRow } from "@/app/actions/projects";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { PersonWithStats } from "@/lib/db/queries/people";
import { toYmd } from "@/lib/tasks/date-shortcuts";
import { isProjectExpired } from "@/lib/projects/archive-status";
import type {
  CalendarData,
  HabitsData,
  JournalTodayData,
  StudioTileSummary,
} from "./useStudioData";

/** Truncate to ~`max` chars on a single line, collapsing whitespace. */
function truncate(text: string, max = 48): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Prefix a list row so the amphitheater body reads as a menu, not a wall. */
function bullet(text: string, max = 44): string {
  return `· ${truncate(text, max)}`;
}

// ── Tasks ───────────────────────────────────────────────────────────────────
const PRIORITY_RANK: Record<TaskWithProjects["priority"], number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  "P∞": 3,
};

function sortOpenTasks(
  tasks: TaskWithProjects[],
): TaskWithProjects[] {
  return [...tasks]
    .filter((t) => t.status !== "lesno")
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      return a.kanbanPosition - b.kanbanPosition;
    });
}

export function summarizeTasks(
  tasks: TaskWithProjects[],
  todayYmd: string,
): StudioTileSummary {
  const open = sortOpenTasks(tasks);
  const dueToday = open.filter((t) => t.dueDate === todayYmd).length;
  const overdue = open.filter(
    (t) => t.dueDate !== null && t.dueDate < todayYmd,
  ).length;
  const next = open[0];

  const meta: string[] = [];
  if (overdue > 0) meta.push(`${overdue} overdue`);
  if (dueToday > 0) meta.push(`${dueToday} due today`);
  if (meta.length === 0 && open.length > 0) {
    meta.push(`${open.length} open`);
  }

  const lines = open
    .slice(1, 5)
    .map((t) => {
      const pri = t.priority === "P1" ? "★ " : "";
      const due =
        t.dueDate === todayYmd
          ? " · today"
          : t.dueDate && t.dueDate < todayYmd
            ? " · overdue"
            : "";
      return bullet(`${pri}${t.title}${due}`, 42);
    });

  return {
    id: "tasks",
    label: "Tasks",
    badge: open.length,
    headline: next ? truncate(next.title, 52) : null,
    subline: meta.length > 0 ? meta.join(" · ") : null,
    lines,
    state: open.length === 0 ? "empty" : "ok",
  };
}

// ── Captures ──────────────────────────────────────────────────────────────────
export function summarizeCaptures(
  captures: CaptureWithLinks[],
  todayYmd: string,
): StudioTileSummary {
  const newestFirst = [...captures].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const newest = newestFirst[0];
  const todayCount = captures.filter(
    (c) => toYmd(c.createdAt) === todayYmd,
  ).length;

  // Badge = last 7 days relative to todayYmd (glanceable "active" count), not
  // the whole library. Anchored on the studio clock so midnight/tests are stable.
  const [yy, mm, dd] = todayYmd.split("-").map(Number);
  const todayStart = new Date(yy ?? 1970, (mm ?? 1) - 1, dd ?? 1).getTime();
  const weekAgo = todayStart - 7 * 24 * 60 * 60 * 1000;
  const recentWeek = captures.filter(
    (c) => c.createdAt.getTime() >= weekAgo,
  ).length;

  const lines = newestFirst
    .slice(1, 5)
    .map((c) => bullet(c.content, 42));

  return {
    id: "captures",
    label: "Captures",
    badge: recentWeek,
    headline: newest ? truncate(newest.content, 52) : null,
    subline:
      todayCount > 0
        ? `${todayCount} today · ${captures.length} total`
        : captures.length > 0
          ? `${captures.length} total`
          : null,
    lines,
    state: captures.length === 0 ? "empty" : "ok",
  };
}

// ── Agenda ────────────────────────────────────────────────────────────────────
function eventTimeLabel(
  event: { start: string; allDay: boolean },
  timezone: string,
): string {
  if (event.allDay) return "all day";
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    }).format(new Date(event.start));
  } catch {
    return "";
  }
}

/** Relative cue for timed events: "now", "in 25m", "in 2h". */
function relativeCue(
  event: { start: string; end: string; allDay: boolean },
  nowMs: number,
): string {
  if (event.allDay) return "all day";
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  if (start <= nowMs && end >= nowMs) return "now";
  const mins = Math.round((start - nowMs) / 60_000);
  if (mins < 0) return "";
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return eventTimeLabel(event, "UTC");
}

export function summarizeAgenda(
  calendar: CalendarData,
  nowMs: number,
): StudioTileSummary {
  const todayYmdTz = (() => {
    try {
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

  const isTodayEvent = (e: {
    start: string;
    end: string;
    allDay: boolean;
  }): boolean => {
    if (e.allDay) {
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

  const lines = sorted
    .filter((e) => e !== next)
    .slice(0, 4)
    .map((e) => {
      const t = eventTimeLabel(e, calendar.timezone);
      return bullet(t ? `${t}  ${e.title}` : e.title, 42);
    });

  const cue = next ? relativeCue(next, nowMs) : null;
  const time = next ? eventTimeLabel(next, calendar.timezone) : null;

  return {
    id: "agenda",
    label: "Agenda",
    badge: remaining.length,
    headline: next ? truncate(next.title, 52) : null,
    subline:
      next && cue
        ? cue === time
          ? cue
          : `${cue}${time && cue !== "now" && cue !== "all day" ? ` · ${time}` : ""}`
        : next
          ? time
          : attention
            ? "Calendar offline"
            : null,
    lines,
    state: attention ? "attention" : remaining.length === 0 ? "empty" : "ok",
  };
}

// ── Habits ────────────────────────────────────────────────────────────────────
export function summarizeHabits(
  habits: HabitsData,
  todayYmd: string,
): StudioTileSummary {
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

  const remaining = dueToday
    .filter((h) => !completedToday.has(h.id))
    .sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  const doneCount = dueToday.length - remaining.length;
  const nextHabit = remaining[0];

  const lines = remaining
    .slice(1, 5)
    .map((h) => bullet(h.name, 42));

  // Completed habits as a soft trailing line when space remains.
  if (lines.length < 3 && doneCount > 0) {
    const done = dueToday
      .filter((h) => completedToday.has(h.id))
      .slice(0, 3 - lines.length);
    for (const h of done) {
      lines.push(`✓ ${truncate(h.name, 40)}`);
    }
  }

  return {
    id: "habits",
    label: "Habits",
    badge: remaining.length,
    headline: nextHabit
      ? truncate(nextHabit.name, 52)
      : dueToday.length > 0
        ? "All done for today"
        : null,
    subline:
      dueToday.length > 0 ? `${doneCount}/${dueToday.length} done` : null,
    lines,
    state: dueToday.length === 0 ? "empty" : "ok",
  };
}

// ── Journal ───────────────────────────────────────────────────────────────────
export function summarizeJournal(journal: JournalTodayData): StudioTileSummary {
  const entry = journal.entry;
  const body = (entry?.mainResponse ?? "").trim();
  const notes = (entry?.notesSection ?? "").trim();
  const written = body.length > 0;
  const paragraphs = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstLine = paragraphs[0] ?? "";

  const lines: string[] = [];
  for (const p of paragraphs.slice(1, 4)) {
    lines.push(bullet(p, 42));
  }
  if (lines.length < 2 && notes) {
    lines.push(bullet(notes, 42));
  }

  return {
    id: "journal",
    label: "Journal",
    badge: null,
    headline: written ? truncate(firstLine, 52) : "No entry yet",
    subline: written ? (notes ? "Written · has notes" : "Written") : null,
    lines,
    state: written ? "ok" : "empty",
  };
}

// ── Projects ──────────────────────────────────────────────────────────────────
export function summarizeProjects(projects: ProjectRow[]): StudioTileSummary {
  const open = projects.filter(
    (p) => p.archivedAt === null && !isProjectExpired(p),
  );

  const ordered = [...open].sort((a, b) => {
    if (a.endDate !== b.endDate) {
      if (a.endDate === null) return 1;
      if (b.endDate === null) return -1;
      return a.endDate < b.endDate ? -1 : 1;
    }
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const next = ordered[0];
  const classCount = open.filter((p) => p.isClass).length;

  const lines = ordered.slice(1, 5).map((p) => {
    const end = p.endDate
      ? ` · ${p.endDate.slice(5).replace("-", "/")}`
      : "";
    const icon = p.icon ? `${p.icon} ` : "";
    return bullet(`${icon}${p.name}${end}`, 42);
  });

  return {
    id: "projects",
    label: "Projects",
    badge: open.length,
    headline: next
      ? truncate(
          next.icon ? `${next.icon} ${next.name}` : next.name,
          52,
        )
      : null,
    subline:
      classCount > 0
        ? `${classCount} class${classCount === 1 ? "" : "es"}`
        : null,
    lines,
    state: open.length === 0 ? "empty" : "ok",
  };
}

// ── Areas ─────────────────────────────────────────────────────────────────────
export function summarizeAreas(areas: SidebarArea[]): StudioTileSummary {
  const active = areas.filter((a) => a.archivedAt === null);
  const activeProjectCount = (area: SidebarArea): number =>
    area.projects.filter((p) => p.archivedAt === null).length;

  const totalActiveProjects = active.reduce(
    (sum, a) => sum + activeProjectCount(a),
    0,
  );

  const ordered = [...active].sort((a, b) => {
    const diff = activeProjectCount(b) - activeProjectCount(a);
    if (diff !== 0) return diff;
    return a.orderIndex - b.orderIndex;
  });
  const top = ordered[0];

  const lines = ordered.slice(0, 4).map((a) => {
    const n = activeProjectCount(a);
    const emoji = a.emoji ? `${a.emoji} ` : "";
    return bullet(
      `${emoji}${a.name}${n > 0 ? ` · ${n}` : ""}`,
      42,
    );
  });

  return {
    id: "areas",
    label: "Areas",
    badge: active.length,
    headline: top
      ? truncate(top.emoji ? `${top.emoji} ${top.name}` : top.name, 52)
      : null,
    subline:
      totalActiveProjects > 0
        ? `${totalActiveProjects} project${totalActiveProjects === 1 ? "" : "s"}`
        : null,
    lines,
    state: active.length === 0 ? "empty" : "ok",
  };
}

// ── People ────────────────────────────────────────────────────────────────────
export function summarizePeople(people: PersonWithStats[]): StudioTileSummary {
  const ordered = [...people].sort((a, b) => {
    if (b.referenceCount !== a.referenceCount) {
      return b.referenceCount - a.referenceCount;
    }
    return a.name.localeCompare(b.name);
  });
  const top = ordered[0];

  const lines = ordered.slice(0, 4).map((p) => {
    const refs =
      p.referenceCount > 0 ? ` · ${p.referenceCount} ref` : "";
    const tags =
      Array.isArray(p.tags) && p.tags.length > 0
        ? ` · ${p.tags.slice(0, 2).join(", ")}`
        : "";
    return bullet(`${p.name}${refs || tags}`, 42);
  });

  return {
    id: "people",
    label: "People",
    badge: people.length,
    headline: top ? truncate(top.name, 52) : null,
    subline:
      top && top.referenceCount > 0
        ? `${top.referenceCount} reference${top.referenceCount === 1 ? "" : "s"}`
        : null,
    lines,
    state: people.length === 0 ? "empty" : "ok",
  };
}
