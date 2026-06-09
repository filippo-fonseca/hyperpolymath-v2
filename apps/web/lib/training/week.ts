/**
 * Week navigation helpers for the Training planner (Phase 15).
 *
 * D-02: planner horizon is one week, Mon–Sun. Prev/next navigation moves by
 * exactly one week. All ISO dates are user-local `yyyy-MM-dd` strings (the
 * server stores `scheduled_date` as a DATE column, no TZ math).
 */

import {
  addWeeks as addWeeksFns,
  eachDayOfInterval,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";

const WEEK_OPTS = { weekStartsOn: 1 as const }; // Monday

export interface WeekRange {
  start: Date;
  end: Date;
  /** Seven `Date` objects, Mon → Sun, set to local midnight. */
  days: Date[];
  /** ISO `yyyy-MM-dd` of `start`. */
  startISO: string;
  /** ISO `yyyy-MM-dd` of `end`. */
  endISO: string;
}

export function getWeekRange(date: Date): WeekRange {
  const start = startOfWeek(date, WEEK_OPTS);
  const end = endOfWeek(date, WEEK_OPTS);
  const days = eachDayOfInterval({ start, end });
  return {
    start,
    end,
    days,
    startISO: format(start, "yyyy-MM-dd"),
    endISO: format(end, "yyyy-MM-dd"),
  };
}

export function addWeeks(date: Date, n: number): Date {
  return addWeeksFns(date, n);
}

export function formatISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseISODate(s: string): Date {
  return parseISO(s);
}
