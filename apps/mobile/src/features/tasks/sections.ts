// Pure grouping/date logic for the tasks screen. Web parity (REBUILD.md):
// Inbox = dueDate null; Overdue = dueDate < today && status != lesno;
// completed (lesno) tasks sink into a collapsible cluster, never vanish.

import type { Task } from "@/data/useTasks";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function localTodayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function shiftISO(dateISO: string, offsetDays: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + offsetDays);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Upcoming Saturday; today when today already is one. */
export function weekendISO(todayISO: string): string {
  const [y, m, d] = todayISO.split("-").map(Number);
  const dow = new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
  return shiftISO(todayISO, (6 - dow + 7) % 7);
}

/** "Aug 12" — bare text, never a chip. */
export function dayLabel(dateISO: string): string {
  const [, m, d] = dateISO.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

export interface DueInfo {
  text: string;
  kind: "overdue" | "today" | "future";
}

export function dueInfo(dueDate: string | null, todayISO: string): DueInfo | null {
  if (!dueDate) return null;
  if (dueDate < todayISO) return { text: "Overdue", kind: "overdue" };
  if (dueDate === todayISO) return { text: "Today", kind: "today" };
  return { text: dayLabel(dueDate), kind: "future" };
}

export type Row =
  | { type: "section"; key: string; title: string; count: number; overdue?: boolean }
  | { type: "day"; key: string; label: string }
  | { type: "task"; key: string; task: Task }
  | { type: "completedHeader"; key: string; count: number; open: boolean };

export interface Counts {
  /** Open tasks with a due date. */
  scheduled: number;
  overdue: number;
  inbox: number;
  completed: number;
}

export function buildRows(
  tasks: Task[],
  todayISO: string,
  completedOpen: boolean,
): { rows: Row[]; counts: Counts } {
  const open = tasks.filter((t) => t.status !== "lesno");
  const completed = tasks
    .filter((t) => t.status === "lesno")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const overdue = open
    .filter((t) => t.dueDate !== null && t.dueDate < todayISO)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const today = open.filter((t) => t.dueDate === todayISO);
  const upcoming = open
    .filter((t) => t.dueDate !== null && t.dueDate > todayISO)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const inbox = open.filter((t) => t.dueDate === null);

  const rows: Row[] = [];
  if (overdue.length) {
    rows.push({
      type: "section",
      key: "s-overdue",
      title: "Overdue",
      count: overdue.length,
      overdue: true,
    });
    for (const t of overdue) rows.push({ type: "task", key: t.id, task: t });
  }
  if (today.length) {
    rows.push({ type: "section", key: "s-today", title: "Today", count: today.length });
    for (const t of today) rows.push({ type: "task", key: t.id, task: t });
  }
  if (upcoming.length) {
    rows.push({
      type: "section",
      key: "s-upcoming",
      title: "Upcoming",
      count: upcoming.length,
    });
    let day: string | null = null;
    for (const t of upcoming) {
      if (t.dueDate !== day) {
        day = t.dueDate!;
        rows.push({ type: "day", key: `d-${day}`, label: dayLabel(day) });
      }
      rows.push({ type: "task", key: t.id, task: t });
    }
  }
  if (inbox.length) {
    rows.push({ type: "section", key: "s-inbox", title: "Inbox", count: inbox.length });
    for (const t of inbox) rows.push({ type: "task", key: t.id, task: t });
  }
  if (completed.length) {
    rows.push({
      type: "completedHeader",
      key: "s-completed",
      count: completed.length,
      open: completedOpen,
    });
    if (completedOpen) {
      for (const t of completed) rows.push({ type: "task", key: t.id, task: t });
    }
  }

  return {
    rows,
    counts: {
      scheduled: overdue.length + today.length + upcoming.length,
      overdue: overdue.length,
      inbox: inbox.length,
      completed: completed.length,
    },
  };
}
