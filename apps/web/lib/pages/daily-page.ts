import { format, parseISO } from "date-fns";

/** Matches a strict calendar date in yyyy-MM-dd form. */
export const DAILY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure, framework-free helpers for Daily Pages (Phase 30). Kept out of the
 * server action so the date->title formatting is trivially unit-testable.
 */

/**
 * The human title for a Daily Page on the given yyyy-MM-dd date, e.g.
 * "Saturday, June 21, 2026". Parses the date as a local calendar day (no
 * timezone shift) via date-fns parseISO + format.
 */
export function dailyPageTitle(date: string): string {
  return format(parseISO(date), "EEEE, MMMM d, yyyy");
}

/** True when the string is a syntactically valid yyyy-MM-dd date. */
export function isValidDailyDate(date: string): boolean {
  if (!DAILY_DATE_RE.test(date)) return false;
  const d = parseISO(date);
  return !Number.isNaN(d.getTime());
}
