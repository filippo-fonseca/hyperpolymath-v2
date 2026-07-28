/**
 * Date helpers for the habits surfaces. All strings are local-`YYYY-MM-DD`
 * (NOT UTC) so what the user sees is what the server stores. Anywhere we
 * cross the wire we use this canonical shape, never a `Date` object.
 *
 * The core helpers live in `lib/habits/dates.ts` so server code (actions,
 * analytics, the Kiwi context node) shares the exact same date math; this file
 * re-exports them to keep existing client import paths working.
 */

export {
  addDaysISO,
  dayOfWeekISO,
  parseISODate,
  toISODate,
  todayISO,
} from "@/lib/habits/dates";
import { parseISODate, toISODate } from "@/lib/habits/dates";

export function compareISODates(a: string, b: string): number {
  // String compare works because the format is fixed-width + numeric.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive count of days in [start, end]. Both ISO. */
export function daysBetweenISO(start: string, end: string): number {
  return (
    Math.round(
      (parseISODate(end).getTime() - parseISODate(start).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1
  );
}

/**
 * Returns the start of the calendar grid for the month containing `monthAnchor`
 * — i.e. the Sunday on or before the first of that month. Used by the
 * mini-calendar to render a 6-row × 7-col grid.
 */
export function calendarGridStart(monthAnchor: Date): Date {
  const first = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    1,
  );
  const dayOfWeek = first.getDay(); // 0 = Sun
  first.setDate(first.getDate() - dayOfWeek);
  return first;
}

export const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
