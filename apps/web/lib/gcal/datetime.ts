/**
 * IANA-aware date helpers for Google Calendar.
 * Phase 4 Plan 04-01 (CAL-08, D-08).
 *
 * Why `@date-fns/tz` over `date-fns-tz`:
 *   - `@date-fns/tz` is the v4-native path (CLAUDE.md's `date-fns-tz` mention
 *     is slightly outdated). Uses Intl under the hood — no embedded IANA db,
 *     ~761B compressed — and composes cleanly with all date-fns functions via
 *     the `TZDate` class.
 *
 * Why `TZDate` instead of "convert at render time":
 *   - DST math is the canonical hard problem. `TZDate(...)` returns a Date
 *     subclass whose getHours/format etc. report the *local wall clock* in the
 *     bound timezone, so addHours(start, 0.5) at the 2am spring-forward jumps
 *     correctly to 03:30 instead of producing a phantom 02:30. Pinning this
 *     via Vitest fixtures (see tests/gcal-datetime.test.ts) is the only way
 *     to ship CAL-08 with confidence.
 *
 * Used by:
 *   - components/calendar/CalendarClient.tsx (event start/end -> TZDate before grid render)
 *   - components/calendar/EventDetailPanel.tsx (form -> gcal ISO via tzWallClockToGcalIso)
 *   - app/(app)/calendar/page.tsx (Server Component initial fetch range computation)
 */

import { TZDate } from "@date-fns/tz";

/**
 * Browser timezone auto-detect (D-08). Call client-side and persist to
 * `users.timezone` on first /calendar visit. Returns an IANA tz like
 * `America/New_York`.
 *
 * Defense in depth: callers should still fall back to `users.timezone` if this
 * returns an empty string (extremely rare; some embedded browsers report `""`).
 */
export function detectBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Convert a gcal ISO datetime ("2026-03-08T10:00:00-05:00" or
 * "2026-03-08T10:00:00Z") to a TZDate bound to the user's timezone. The
 * returned TZDate renders as the user's *local wall clock* via date-fns
 * `format`, `getHours`, etc.
 *
 * @param iso          ISO 8601 string from gcal.events.list response.
 * @param userTimezone IANA tz from users.timezone (e.g. "America/New_York").
 */
export function gcalIsoToTZDate(iso: string, userTimezone: string): TZDate {
  return new TZDate(new Date(iso), userTimezone);
}

/**
 * Convert a form-input wall-clock datetime (year/month/day/hour/minute in the
 * user's tz) to the UTC ISO string gcal accepts on insert/patch.
 *
 * Month is 0-indexed to mirror JavaScript's Date constructor convention
 * (March = 2, November = 10).
 *
 * DST notes:
 *   - At spring-forward (Mar 8 2026 02:00 -> 03:00 in America/New_York), the
 *     02:00 hour does not exist. Constructing TZDate(... 2, 30 ...) yields a
 *     date that resolves to 03:30 EDT — gcal will accept this. If the user's
 *     form input was literally "2:30 AM Mar 8" the UI should flag this before
 *     submit (defer to Plan 04-04 EventDetailPanel validation).
 *   - At fall-back (Nov 1 2026 02:00 -> 01:00), the 01:00 hour repeats. Without
 *     additional offset info we default to the post-transition (EST = UTC-5)
 *     interpretation, matching gcal's own form behavior.
 */
export function tzWallClockToGcalIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  userTimezone: string,
): string {
  const tzDate = new TZDate(year, month, day, hour, minute, userTimezone);
  return tzDate.toISOString();
}
