/** Task deadline reminder offsets — mirrors apps/web/lib/tasks/reminders.ts. */

export type ReminderUnit = "minutes" | "hours" | "days" | "weeks";

export interface TaskReminder {
  id: string;
  amount: number;
  unit: ReminderUnit;
}

const UNIT_MS: Record<ReminderUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 7 * 86_400_000,
};

export function newReminderId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function describeReminder(r: TaskReminder): string {
  const unit = r.amount === 1 ? r.unit.replace(/s$/, "") : r.unit;
  return `${r.amount} ${unit} before due`;
}

export function reminderOffsetMs(r: TaskReminder): number {
  return r.amount * UNIT_MS[r.unit];
}

/** Due moment in local device TZ. dueTime HH:mm or default 09:00. */
export function resolveDueDateTime(dueDate: string, dueTime: string | null | undefined): Date {
  const time =
    dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime) ? dueTime : "09:00";
  const [y, m, d] = dueDate.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y!, m! - 1, d!, hh!, mm!, 0, 0);
}

export function reminderFireAt(
  dueDate: string | null | undefined,
  dueTime: string | null | undefined,
  reminder: TaskReminder,
): Date | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const due = resolveDueDateTime(dueDate, dueTime);
  return new Date(due.getTime() - reminderOffsetMs(reminder));
}
