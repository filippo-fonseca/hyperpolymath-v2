import { z } from "zod";

/**
 * Task deadline reminders — offsets BEFORE the task's due datetime.
 *
 * Tasks store a date-only `due_date`. An optional `due_time` (HH:mm, 24h) pins
 * the wall-clock due moment; when absent we default to 09:00 in the caller's
 * timezone for fire-time math. Each reminder is `{ amount, unit }` before that
 * moment. Unlimited list (capped at 50 for payload sanity).
 */

export type ReminderUnit = "minutes" | "hours" | "days" | "weeks";

export interface TaskReminder {
  /** Stable client id so mobile notification identifiers stay stable across sync. */
  id: string;
  amount: number;
  unit: ReminderUnit;
}

export const ReminderUnitSchema = z.enum(["minutes", "hours", "days", "weeks"]);

export const TaskReminderSchema = z.object({
  id: z.string().trim().min(1).max(64),
  amount: z.number().int().min(1).max(100_000),
  unit: ReminderUnitSchema,
});

export const TaskRemindersSchema = z.array(TaskReminderSchema).max(50);

/** Optional due wall-clock time as HH:mm (24h). */
export const DueTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();

const UNIT_MS: Record<ReminderUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 7 * 86_400_000,
};

const DEFAULT_DUE_TIME = "09:00";

export function normalizeReminders(
  reminders: TaskReminder[] | null | undefined,
): TaskReminder[] | null {
  if (!reminders || reminders.length === 0) return null;
  const seen = new Set<string>();
  const out: TaskReminder[] = [];
  for (const r of reminders) {
    const id = r.id.trim().slice(0, 64);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const amount = Math.min(100_000, Math.max(1, Math.round(r.amount)));
    out.push({ id, amount, unit: r.unit });
    if (out.length >= 50) break;
  }
  return out.length > 0 ? out : null;
}

/** Offset duration in milliseconds. */
export function reminderOffsetMs(reminder: TaskReminder): number {
  return reminder.amount * UNIT_MS[reminder.unit];
}

/**
 * Resolve the absolute due Date used for reminder math.
 * `dueDate` is YYYY-MM-DD; `dueTime` is HH:mm or null (defaults to 09:00).
 * Interpretation is local to the provided IANA timezone when `Temporal`/`tz`
 * helpers aren't available — we construct via `Date` from an ISO-like string
 * with explicit offset fallback: for scheduling we pass the components through
 * and let the mobile client interpret in device TZ; server cron (if any) should
 * pass the user's stored IANA zone.
 */
export function resolveDueDateTime(
  dueDate: string,
  dueTime: string | null | undefined,
  timeZone = "UTC",
): Date {
  const time = dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime) ? dueTime : DEFAULT_DUE_TIME;
  const [y, m, d] = dueDate.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // Prefer Intl-based construction so wall clock matches the user's zone.
  try {
    const asUtcGuess = new Date(Date.UTC(y!, m! - 1, d!, hh!, mm!, 0));
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    // Binary-search-ish adjust: format asUtcGuess in zone and shift by delta.
    const parts = Object.fromEntries(
      fmt.formatToParts(asUtcGuess).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const got = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? "0" : parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const want = Date.UTC(y!, m! - 1, d!, hh!, mm!, 0);
    return new Date(asUtcGuess.getTime() + (want - got));
  } catch {
    return new Date(`${dueDate}T${time}:00Z`);
  }
}

/** Absolute fire time for one reminder (null if due date missing). */
export function reminderFireAt(
  dueDate: string | null | undefined,
  dueTime: string | null | undefined,
  reminder: TaskReminder,
  timeZone = "UTC",
): Date | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const due = resolveDueDateTime(dueDate, dueTime, timeZone);
  return new Date(due.getTime() - reminderOffsetMs(reminder));
}

export function describeReminder(reminder: TaskReminder): string {
  const n = reminder.amount;
  const unit =
    n === 1 ? reminder.unit.replace(/s$/, "") : reminder.unit;
  return `${n} ${unit} before due`;
}

export function newReminderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
