// Widget snapshot sync — builds craft-register snapshots for the three v2
// widgets (Tasks, Habits, Capture) from the typed device API and pushes them
// into the WidgetKit timeline via expo-widgets.
//
// Interactivity: widget rows are iOS 17 interactive Buttons. Their onPress
// handlers run in the widget's own JS runtime and optimistically rewrite the
// stored snapshot (row leaves instantly), recording the action under a
// `pending` prop. The app is the durable writer: drainPendingWidgetActions()
// reads `pending` back via getTimeline() and replays it against the device
// API — immediately when the app is alive (addUserInteractionListener), and
// on the next launch/foreground when it wasn't.
//
// Wiring contract (shell lane): call startWidgetSync() once after auth is
// ready; it seeds, syncs immediately, then re-syncs on foreground and every
// 15 minutes. Jarvis tool-calls can call syncWidgets() directly through the
// invalidation path.

import { AppState } from "react-native";
import { addUserInteractionListener } from "expo-widgets";

import {
  getHabits,
  getTasks,
  HABIT_LADDER,
  localDateString,
  setHabitStatus,
  updateTask,
  type HabitData,
  type HabitLadderStatus,
  type Task,
} from "../api/device";
import { queryClient } from "../data/queryClient";
import CaptureWidget from "./CaptureWidget";
import HabitsWidget, { type HabitsWidgetProps } from "./HabitsWidget";
import TasksWidget, { type TasksWidgetProps } from "./TasksWidget";

function dayOfWeek(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
}

const PRIORITY_RANK: Record<string, number> = { "P∞": 0, P1: 1, P2: 2, P3: 3 };

export function buildTasksSnapshot(tasks: Task[], todayISO: string): TasksWidgetProps {
  const open = tasks.filter((t) => t.dueDate !== null && t.status !== "lesno");
  // Rows are today's open tasks only, in priority order (then timed-first,
  // then title). Overdue never takes a row — it is one coral count.
  const today = open
    .filter((t) => t.dueDate === todayISO)
    .sort(
      (a, z) =>
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[z.priority] ?? 9) ||
        (a.dueTime ?? "99:99").localeCompare(z.dueTime ?? "99:99") ||
        a.title.localeCompare(z.title),
    );
  return {
    todayCount: today.length,
    doneCount: tasks.filter((t) => t.dueDate === todayISO && t.status === "lesno").length,
    overdueCount: open.filter((t) => (t.dueDate as string) < todayISO).length,
    tasks: today.slice(0, 8).map((t) => ({
      id: t.id,
      title: t.title,
      time: t.dueTime ?? "",
      p1: t.priority === "P1",
    })),
    pending: [],
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
  // Done rows never ship — the done/scheduled progress line carries them.
  // Partial progress floats up: almost_done, then in_progress, then untouched.
  const openRows = rows
    .filter((r) => r.rung < 3)
    .sort((a, z) => z.rung - a.rung);
  return {
    done: rows.filter((r) => r.rung >= 3).length,
    scheduled: rows.length,
    habits: openRows.slice(0, 4),
    pending: {},
  };
}

/** Seed all widgets so the home screen never shows a blank first paint. */
export function seedWidgetSnapshots(): void {
  try {
    TasksWidget.updateSnapshot({
      todayCount: 0,
      doneCount: 0,
      overdueCount: 0,
      tasks: [],
      pending: [],
    });
    HabitsWidget.updateSnapshot({ done: 0, scheduled: 0, habits: [], pending: {} });
    CaptureWidget.updateSnapshot({ ready: true });
  } catch {
    // Expo Go / stubs — ignore.
  }
}

/**
 * Replay widget-made completions against the device API. Returns false when
 * any replay failed — callers must then skip the snapshot rebuild for that
 * widget so the pending marker survives for the next drain.
 */
async function drainTasksPending(): Promise<boolean> {
  const pending = new Set<string>();
  try {
    for (const entry of await TasksWidget.getTimeline()) {
      for (const id of entry.props.pending ?? []) pending.add(id);
    }
  } catch {
    return true; // stub environment — nothing to drain
  }
  let ok = true;
  for (const id of pending) {
    if (!(await updateTask({ id, status: "lesno" }))) ok = false;
  }
  return ok;
}

async function drainHabitsPending(todayISO: string): Promise<boolean> {
  const pending = new Map<string, number>();
  try {
    for (const entry of await HabitsWidget.getTimeline()) {
      for (const [id, rung] of Object.entries(entry.props.pending ?? {})) {
        pending.set(id, Math.max(pending.get(id) ?? 0, rung));
      }
    }
  } catch {
    return true;
  }
  let ok = true;
  for (const [habitId, rung] of pending) {
    const status = (HABIT_LADDER[Math.min(3, Math.max(0, rung))] ??
      "done") as HabitLadderStatus;
    if (!(await setHabitStatus({ habitId, completedDate: todayISO, status }))) ok = false;
  }
  if (pending.size > 0 && ok) {
    // The app's lists should reflect widget-made changes immediately.
    void queryClient.invalidateQueries();
  }
  return ok;
}

let syncInFlight = false;

/** Drain widget-made actions, then refresh every widget from the live APIs. */
export async function syncWidgets(): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const today = localDateString(0);
    const [tasksDrained, habitsDrained] = await Promise.all([
      drainTasksPending(),
      drainHabitsPending(today),
    ]);
    const [tasks, habits] = await Promise.all([getTasks(), getHabits(today, today)]);

    if (tasks !== null && tasksDrained) {
      TasksWidget.updateSnapshot(buildTasksSnapshot(tasks, today));
      TasksWidget.reload();
    }
    if (habits !== null && habitsDrained) {
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
 * Seed, sync now, then keep widgets fresh on widget interactions, foreground,
 * and a 15-minute interval. Returns a stop function.
 */
export function startWidgetSync(): () => void {
  seedWidgetSnapshots();
  void syncWidgets();
  let interaction: { remove(): void } | null = null;
  try {
    // Fires when a widget Button intent runs while the app is alive; the
    // drain inside syncWidgets turns the optimistic press into the real write.
    interaction = addUserInteractionListener(() => void syncWidgets());
  } catch {
    interaction = null; // stub environment
  }
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") void syncWidgets();
  });
  const interval = setInterval(() => {
    if (AppState.currentState === "active") void syncWidgets();
  }, SYNC_INTERVAL_MS);
  return () => {
    interaction?.remove();
    sub.remove();
    clearInterval(interval);
  };
}
