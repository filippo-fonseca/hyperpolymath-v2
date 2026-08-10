// Issue #396 — the fixed reminder-offset ladder for task due notifications.
// Offsets are minutes before the due moment (dueDate + dueTime, with a
// day-granular default when dueTime is null). The set is closed: writers
// normalize anything else away, so every stored value is one of these.

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

const ALLOWED = new Set<number>(REMINDER_OFFSETS.map((o) => o.minutes));

/** Compact display form ("10 min" / "1 hr" / "1 day" / "1 wk") for chips. */
export function shortReminderLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${minutes / 60} hr`;
  if (minutes < 10080) return `${minutes / 1440} day${minutes > 1440 ? "s" : ""}`;
  return `${minutes / 10080} wk`;
}

/**
 * Clamp to the preset ladder, dedupe, and sort ascending so the stored array
 * is canonical regardless of client ordering.
 */
export function normalizeReminderOffsets(values: number[]): number[] {
  return [...new Set(values.filter((v) => ALLOWED.has(v)))].sort((a, b) => a - b);
}
