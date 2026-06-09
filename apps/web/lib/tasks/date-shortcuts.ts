import { addDays, nextSunday as fnsNextSunday, startOfWeek } from "date-fns";

/**
 * Shared date-shortcut math for the kanban day view + task detail panel.
 *
 * All helpers operate in local time and return midnight-anchored Date
 * objects. Convert with `toYmd()` when persisting to the DB (the `dueDate`
 * column is a plain DATE, not a TIMESTAMPTZ).
 */

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => Number(n));
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function tomorrowYmd(from: Date = new Date()): string {
  return toYmd(addDays(from, 1));
}

/**
 * "This Sunday" = the next occurring Sunday, where Sunday itself counts as
 * "today" (so if it's already Sunday, return today). Matches the colloquial
 * interpretation people use when scheduling tasks.
 */
export function thisSundayYmd(from: Date = new Date()): string {
  if (from.getDay() === 0) return toYmd(from);
  return toYmd(fnsNextSunday(from));
}

/**
 * "Next week" = Monday of the next ISO week. If today IS Monday, "next
 * Monday" means +7 days. Matches the standard scheduling meaning.
 */
export function nextWeekYmd(from: Date = new Date()): string {
  const thisMonday = startOfWeek(from, { weekStartsOn: 1 });
  return toYmd(addDays(thisMonday, 7));
}
