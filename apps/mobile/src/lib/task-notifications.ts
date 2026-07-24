import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import type { Task } from "./data";
import { reminderFireAt, resolveDueDateTime } from "./reminders";

const ANDROID_CHANNEL = "task-deadlines";
const PREFIX = "task-reminder:";

let handlerInstalled = false;

export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: "Task deadlines",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#00d4ff",
  });
}

export type NotificationPermissionState = "granted" | "denied" | "undetermined";

export async function getNotificationPermission(): Promise<NotificationPermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

/**
 * Request notification permissions. Returns true when we can schedule.
 * No-ops usefully on web / unsupported platforms.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  installNotificationHandler();
  await ensureAndroidChannel();

  if (Platform.OS === "web") return false;
  // Local notifications work on simulators; still request permission.
  if (!Device.isDevice && Platform.OS === "ios") {
    // Simulators can schedule local notifications on modern iOS.
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return requested.status === "granted";
}

function notifId(taskId: string, reminderId: string): string {
  // iOS identifier max length is generous; keep stable + unique.
  return `${PREFIX}${taskId}:${reminderId}`.slice(0, 120);
}

function dueNotifId(taskId: string): string {
  return `${PREFIX}${taskId}:due`.slice(0, 120);
}

async function cancelTaskNotifications(taskId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ids = scheduled
    .map((n) => n.identifier)
    .filter((id) => id.startsWith(`${PREFIX}${taskId}:`));
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

/**
 * Reschedule local notifications for all incomplete tasks that have a due date.
 * Cancels stale schedules first. Safe to call after every tasks refresh.
 */
export async function syncTaskDeadlineNotifications(tasks: Task[]): Promise<{
  scheduled: number;
  skippedPermission: boolean;
}> {
  installNotificationHandler();
  await ensureAndroidChannel();

  const permitted = await getNotificationPermission();
  if (permitted !== "granted") {
    return { scheduled: 0, skippedPermission: true };
  }

  // Cancel everything we own, then re-add — simpler than diffing.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const now = Date.now() + 5_000; // small skew so we don't schedule "now"
  let count = 0;

  for (const task of tasks) {
    if (task.status === "lesno") continue;
    if (!task.dueDate) continue;

    const due = resolveDueDateTime(task.dueDate, task.dueTime);
    if (due.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: dueNotifId(task.id),
        content: {
          title: "Task due",
          body: task.title,
          data: { taskId: task.id, kind: "due" },
          sound: true,
          ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: due,
        },
      });
      count += 1;
    }

    for (const reminder of task.reminders ?? []) {
      const fire = reminderFireAt(task.dueDate, task.dueTime, reminder);
      if (!fire || fire.getTime() <= now) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: notifId(task.id, reminder.id),
        content: {
          title: "Task reminder",
          body: task.title,
          data: { taskId: task.id, kind: "reminder", reminderId: reminder.id },
          sound: true,
          ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fire,
        },
      });
      count += 1;
    }
  }

  return { scheduled: count, skippedPermission: false };
}

export async function cancelAllTaskNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export { cancelTaskNotifications };
