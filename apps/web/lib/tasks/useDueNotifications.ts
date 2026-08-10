"use client";

import { useEffect } from "react";
import { fromYmd } from "@/lib/tasks/date-shortcuts";
import { shortReminderLabel } from "@/lib/tasks/reminders";

/**
 * Issue #396 — browser notifications for due tasks and their reminder
 * offsets, tab-open only.
 *
 * Scope, deliberately: this hook arms plain setTimeout timers while /tasks is
 * mounted, so it covers the "I'm working with the app open" case. Delivery
 * with the app closed is mobile's job (expo-notifications schedules real OS
 * notifications from the same dueDate/dueTime/reminderOffsetsMin fields), so
 * there is no service worker or push plumbing here.
 *
 * Timeless tasks anchor at 09:00 local, matching mobile's DEFAULT_TIME so the
 * two surfaces never disagree about when "sometime today" happens. Fired keys
 * live in a module-level Set: re-renders re-arm timers freely, but a
 * (task, offset, instant) fires at most once per page load.
 */

const DEFAULT_TIME = "09:00";
const MAX_HORIZON_MS = 24 * 60 * 60 * 1000;

const fired = new Set<string>();

interface DueTaskLike {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  dueTime: string | null;
  reminderOffsetsMin: number[];
}

function fireMoment(dueDate: string, dueTime: string | null): number {
  const d = fromYmd(dueDate);
  const [hh, mm] = (dueTime ?? DEFAULT_TIME).split(":").map(Number);
  d.setHours(hh ?? 9, mm ?? 0, 0, 0);
  return d.getTime();
}

export function useDueNotifications(tasks: DueTaskLike[]): void {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const now = Date.now();
    const pending: { key: string; at: number; title: string; body: string }[] = [];

    for (const t of tasks) {
      if (!t.dueDate || t.status === "lesno") continue;
      const due = fireMoment(t.dueDate, t.dueTime);
      // Offset 0 is the due moment itself; the rest are the reminder ladder.
      for (const offset of [0, ...t.reminderOffsetsMin]) {
        const at = due - offset * 60_000;
        if (at <= now || at - now > MAX_HORIZON_MS) continue;
        const key = `${t.id}|${offset}|${at}`;
        if (fired.has(key)) continue;
        pending.push({
          key,
          at,
          title: offset === 0 ? "Task due now" : t.title,
          body:
            offset === 0 ? t.title : `Due in ${shortReminderLabel(offset)}`,
        });
      }
    }

    if (pending.length === 0) return;
    // Lazy permission ask — only once something would actually fire.
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }

    const timers = pending.map((p) =>
      window.setTimeout(() => {
        if (fired.has(p.key)) return;
        fired.add(p.key);
        if (Notification.permission === "granted") {
          new Notification(p.title, { body: p.body, tag: p.key });
        }
      }, p.at - now),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [tasks]);
}
