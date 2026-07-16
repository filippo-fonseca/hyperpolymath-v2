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

/**
 * What clicking a calendar day should do (Phase 30, corrected). Clicking NEVER
 * auto-creates a page — that was the bug. A day that already has a page routes
 * to it; any other day just becomes the selection (the UI then shows the
 * "No daily page" + retroactive-create panel).
 *
 *   - "route"  -> navigate to the existing page (existingPageId is set).
 *   - "select" -> highlight the day; no navigation, no create.
 */
export function dailyDayClickAction(
  date: string,
  existingPageId: string | undefined,
): { kind: "route"; pageId: string } | { kind: "select" } {
  if (existingPageId) return { kind: "route", pageId: existingPageId };
  return { kind: "select" };
}

/**
 * Whether the Wiki home should auto-create + open today's Daily Page on first
 * mount (WIKI-DAILY-02). Only true once the daily-pages list has actually
 * loaded (so we never act on the empty placeholder) AND today has no page yet.
 * A day that already has a page is left alone — no forced redirect.
 */
export function shouldAutoOpenToday(args: {
  dailyFetched: boolean;
  todayExists: boolean;
}): boolean {
  return args.dailyFetched && !args.todayExists;
}

/**
 * Wave-3 guard for `useEnsureTodayDailyPage`. Fires the guarded insert AT MOST
 * once per mount per calendar day. Distinct from `shouldAutoOpenToday` because
 * this one NEVER navigates — the Wiki-home rail just needs the row to exist so
 * the "today" card can render its preview. Race-safe against the app-wide
 * `DailyAutoOpen` (both hit the same partial unique index, so the second write
 * becomes a no-op).
 */
export function shouldEnsureTodayDailyPage(args: {
  dailyFetched: boolean;
  todayExists: boolean;
  hasFiredForDate: boolean;
}): boolean {
  if (!args.dailyFetched) return false;
  if (args.todayExists) return false;
  if (args.hasFiredForDate) return false;
  return true;
}
