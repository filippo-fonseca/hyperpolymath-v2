// Widget snapshot sync — builds craft-register snapshots for the three v2
// widgets (Tasks, Habits, Capture) from the typed device API and pushes them
// into the WidgetKit timeline via expo-widgets.
//
// Wiring contract (shell lane): call startWidgetSync() once after auth is
// ready; it seeds, syncs immediately, then re-syncs on foreground and every
// 15 minutes. Jarvis tool-calls can call syncWidgets() directly through the
// invalidation path.

import { AppState } from "react-native";

import {
  getHabits,
  getTasks,
  HABIT_LADDER,
  localDateString,
  type HabitData,
  type Task,
} from "../api/device";
import CaptureWidget from "./CaptureWidget";
import HabitsWidget, { type HabitsWidgetProps } from "./HabitsWidget";
import TasksWidget, { type TasksWidgetProps, type TasksWidgetTask } from "./TasksWidget";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "MMM d" from a local YYYY-MM-DD, no Date timezone pitfalls. */
function dueLabel(dueISO: string, todayISO: string): TasksWidgetTask["due"] {
  if (dueISO < todayISO) return "Overdue";
  if (dueISO === todayISO) return "Today";
  const [, m, d] = dueISO.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

function dueKind(dueISO: string, todayISO: string): TasksWidgetTask["dueKind"] {
  if (dueISO < todayISO) return "overdue";
  if (dueISO === todayISO) return "today";
  return "future";
}

function dayOfWeek(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
}

export function buildTasksSnapshot(tasks: Task[], todayISO: string): TasksWidgetProps {
  // Same filter as the LifeOS tasks widget: dated, not lesno, due ascending.
  const dated = tasks
    .filter((t) => t.dueDate !== null && t.status !== "lesno")
    .sort(
      (a, z) =>
        (a.dueDate as string).localeCompare(z.dueDate as string) ||
        a.title.localeCompare(z.title),
    );
  return {
    scheduledCount: dated.length,
    overdueCount: dated.filter((t) => (t.dueDate as string) < todayISO).length,
    todayCount: dated.filter((t) => t.dueDate === todayISO).length,
    tasks: dated.slice(0, 7).map((t) => ({
      id: t.id,
      title: t.title,
      due: dueLabel(t.dueDate as string, todayISO),
      dueKind: dueKind(t.dueDate as string, todayISO),
      p1: t.priority === "P1",
    })),
  };
}

export function buildHabitsSnapshot(data: HabitData, todayISO: string): HabitsWidgetProps {
  const dow = dayOfWeek(todayISO);
  const scheduled = data.habits
    .filter((h) => h.daysOfWeek[dow] !== false)
    .sort((a, z) => a.orderIndex - z.orderIndex);
  const rungByHabit = new Map<string, number>();
  for (const c of data.completions) {
    if (c.completedDate !== todayISO) continue;
    rungByHabit.set(c.habitId, Math.max(0, HABIT_LADDER.indexOf(c.status ?? "done")));
  }
  const rows = scheduled.map((h) => ({
    id: h.id,
    name: h.name,
    rung: rungByHabit.get(h.id) ?? 0,
  }));
  return {
    done: rows.filter((r) => r.rung >= 3).length,
    scheduled: rows.length,
    habits: rows.slice(0, 4),
  };
}

/** Seed all widgets so the home screen never shows a blank first paint. */
export function seedWidgetSnapshots(): void {
  try {
    TasksWidget.updateSnapshot({ scheduledCount: 0, overdueCount: 0, todayCount: 0, tasks: [] });
    HabitsWidget.updateSnapshot({ done: 0, scheduled: 0, habits: [] });
    CaptureWidget.updateSnapshot({ ready: true });
  } catch {
    // Expo Go / stubs — ignore.
  }
}

let syncInFlight = false;

/** Refresh every widget from the live device APIs. Safe to call often. */
export async function syncWidgets(): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const today = localDateString(0);
    const [tasks, habits] = await Promise.all([getTasks(), getHabits(today, today)]);

    if (tasks !== null) {
      TasksWidget.updateSnapshot(buildTasksSnapshot(tasks, today));
      TasksWidget.reload();
    }
    if (habits !== null) {
      HabitsWidget.updateSnapshot(buildHabitsSnapshot(habits, today));
      HabitsWidget.reload();
    }
    // Capture is static; nothing to refresh.
  } catch {
    // Network / auth failures — leave the previous snapshots alone.
  } finally {
    syncInFlight = false;
  }
}

const SYNC_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Seed, sync now, then keep widgets fresh on foreground + a 15-minute
 * interval. Returns a stop function.
 */
export function startWidgetSync(): () => void {
  seedWidgetSnapshots();
  void syncWidgets();
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") void syncWidgets();
  });
  const interval = setInterval(() => {
    if (AppState.currentState === "active") void syncWidgets();
  }, SYNC_INTERVAL_MS);
  return () => {
    sub.remove();
    clearInterval(interval);
  };
}
