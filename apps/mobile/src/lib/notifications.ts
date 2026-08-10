// Local notifications for task due dates and reminders. Purely device-side:
// the tasks query is the source of truth and this module diffs the OS
// notification queue against it — no server push involved.
//
// Semantics: every open (non-lesno) task with a due date today or later
// gets one notification at its due time (local), or 09:00 when the task
// is date-only, plus one per reminder offset (task-rem-<id>-<minutes>) at
// due-minus-offset. Moments already in the past schedule nothing.
// Completing, deleting, re-dating, or re-remindering a task reconciles its
// pending notifications on the next sync.

import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useEffect } from "react";

import type { Task } from "../api/device";
import { queryClient } from "../data/queryClient";
import { queryKeys } from "../data/queryKeys";
import { shortReminderLabel } from "./reminders";

const ID_PREFIX = "task-due-";
const REM_PREFIX = "task-rem-";
const DEFAULT_TIME = "09:00";
const SYNC_DEBOUNCE_MS = 2000;

Notifications.setNotificationHandler({
  // Foreground: quiet banner, no sound, no badge — the list is already
  // on screen; the banner is just a nudge.
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let askedThisRun = false;

/** True when notifications may be scheduled. Prompts at most once per run. */
async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain || askedThisRun) return false;
  askedThisRun = true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

function localTodayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fireMoment(dueDate: string, dueTime: string | null): Date {
  const [y, m, d] = dueDate.split("-").map(Number);
  const [hh, mm] = (dueTime ?? DEFAULT_TIME).split(":").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function bodyFor(task: Task, todayISO: string): string {
  const day =
    task.dueDate === todayISO
      ? "Due today"
      : (() => {
          const [, m, d] = task.dueDate!.split("-").map(Number);
          return `Due ${MONTHS[(m ?? 1) - 1]} ${d}`;
        })();
  return task.dueTime ? `${day} · ${task.dueTime}` : day;
}

interface Desired {
  id: string;
  title: string;
  body: string;
  fireAt: number;
}

function desiredFor(tasks: Task[]): Map<string, Desired> {
  const todayISO = localTodayISO();
  const now = Date.now();
  const out = new Map<string, Desired>();
  for (const task of tasks) {
    if (task.status === "lesno") continue;
    if (!task.dueDate || task.dueDate < todayISO) continue;
    if (task.id.startsWith("temp-")) continue;
    const dueAt = fireMoment(task.dueDate, task.dueTime).getTime();
    if (dueAt > now) {
      out.set(`${ID_PREFIX}${task.id}`, {
        id: `${ID_PREFIX}${task.id}`,
        title: task.title,
        body: bodyFor(task, todayISO),
        fireAt: dueAt,
      });
    }
    // One extra notification per reminder offset, at due-minus-offset.
    for (const offset of task.reminderOffsetsMin ?? []) {
      const fireAt = dueAt - offset * 60_000;
      if (fireAt <= now) continue;
      const id = `${REM_PREFIX}${task.id}-${offset}`;
      out.set(id, {
        id,
        title: task.title,
        body: `Due in ${shortReminderLabel(offset)} · ${bodyFor(task, todayISO)}`,
        fireAt,
      });
    }
  }
  return out;
}

let syncing = false;
let rerun = false;

/**
 * Reconcile the OS notification queue with the given tasks. Diff-based:
 * only changed entries are cancelled/rescheduled, and notifications not
 * bearing our identifier prefix are never touched.
 */
export async function syncTaskNotifications(tasks: Task[]): Promise<void> {
  if (syncing) {
    rerun = true;
    return;
  }
  syncing = true;
  try {
    if (!(await ensurePermission())) return;
    const desired = desiredFor(tasks);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    for (const existing of scheduled) {
      const id = existing.identifier;
      if (!id.startsWith(ID_PREFIX) && !id.startsWith(REM_PREFIX)) continue;
      const want = desired.get(id);
      const data = existing.content.data as { fireAt?: number } | null;
      const unchanged =
        want &&
        data?.fireAt === want.fireAt &&
        existing.content.title === want.title &&
        existing.content.body === want.body;
      if (unchanged) {
        desired.delete(id);
      } else {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }

    for (const want of desired.values()) {
      await Notifications.scheduleNotificationAsync({
        identifier: want.id,
        content: {
          title: want.title,
          body: want.body,
          data: { fireAt: want.fireAt, url: "/tasks" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(want.fireAt),
        },
      });
    }
  } catch {
    // Fail-soft: notifications are a bonus, never a crash.
  } finally {
    syncing = false;
    if (rerun) {
      rerun = false;
      const tasksNow = queryClient.getQueryData<Task[]>(queryKeys.tasks);
      if (tasksNow) void syncTaskNotifications(tasksNow);
    }
  }
}

let routedColdStart = false;

/**
 * Routes notification taps to their data.url payload ("/tasks"). Covers
 * both the warm tap (listener) and the cold-start tap that launched the
 * app (last response, replayed once per process). Mount once in the
 * authed shell.
 */
export function useNotificationTapRouting(): void {
  useEffect(() => {
    const route = (resp: Notifications.NotificationResponse | null) => {
      const url = (resp?.notification.request.content.data as { url?: unknown } | null)
        ?.url;
      if (typeof url === "string" && url.startsWith("/")) router.push(url as Href);
    };
    if (!routedColdStart) {
      routedColdStart = true;
      Notifications.getLastNotificationResponseAsync()
        .then(route)
        .catch(() => {});
    }
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => sub.remove();
  }, []);
}

/**
 * Watches the tasks query cache and reconciles the notification queue,
 * debounced so streams of optimistic updates coalesce into one pass.
 * Mount once in the authed shell.
 */
export function useTaskNotificationSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const tasks = queryClient.getQueryData<Task[]>(queryKeys.tasks);
        if (tasks) void syncTaskNotifications(tasks);
      }, SYNC_DEBOUNCE_MS);
    };

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.query.queryKey.length === queryKeys.tasks.length &&
        event.query.queryKey[0] === queryKeys.tasks[0]
      ) {
        kick();
      }
    });
    kick();

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
