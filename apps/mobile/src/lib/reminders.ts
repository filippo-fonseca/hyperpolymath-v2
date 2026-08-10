// Issue #396 — the fixed reminder-offset ladder for task due notifications.
// Mirrors apps/web/lib/tasks/reminders.ts: offsets are minutes before the
// due moment (dueDate + dueTime, with the 09:00 default when date-only).
// The set is closed; the server normalizes anything else away.

export const REMINDER_OFFSETS = [
  { minutes: 10, label: "10 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 720, label: "12 hours before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 4320, label: "3 days before" },
  { minutes: 10080, label: "1 week before" },
] as const;

/** Compact display form ("10 min" / "1 hr" / "2 hrs" / "1 day" / "1 wk"). */
export function shortReminderLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = minutes / 60;
    return `${h} hr${h > 1 ? "s" : ""}`;
  }
  if (minutes < 10080) {
    const d = minutes / 1440;
    return `${d} day${d > 1 ? "s" : ""}`;
  }
  return `${minutes / 10080} wk`;
}
