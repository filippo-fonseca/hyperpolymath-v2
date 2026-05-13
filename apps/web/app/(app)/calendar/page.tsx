/**
 * `/calendar` — the read-only Google Calendar grid view.
 *
 * Phase 4 Plan 04-03 (CAL-03, CAL-07, CAL-08).
 *
 * Why a Server Component (with `force-dynamic`):
 *   - Initial events render in SSR — no flash of empty grid on first paint.
 *   - The Server Component talks to gcal *once* per visit; the client then
 *     wraps `initialEvents` in `useQuery` and re-fetches on window focus
 *     or filter change.
 *   - `force-dynamic` because gcal is the source of truth (CAL-07 — no
 *     Postgres mirror). Caching the page would surface stale events on
 *     navigation.
 *
 * Flow:
 *   1. requireOnboarded → guarantees a `public.users` row with `id` + an
 *      `onboarded_at` timestamp.
 *   2. Run a single round-trip for connection status + tz + visibility
 *      prefs in parallel.
 *   3. If `not_connected`: render `<EmptyState />` (Connect CTA). No gcal
 *      call attempted.
 *   4. Otherwise: fetch this week's events + the calendar list in parallel
 *      via `getValidGcalToken`. If the refresh fails with `invalid_grant`
 *      the token layer clears the encrypted columns and throws
 *      `GcalTokenRevokedError` — we catch it and render
 *      `<DisconnectBanner variant="revoked" />` above the (now empty) grid.
 *
 * Monday-start (RESEARCH Open Q 1):
 *   The localizer in CalendarGrid is hard-coded `weekStartsOn: 1`. We mirror
 *   that here for the initial event-range computation so the SSR window
 *   matches what the grid will render. Defer a `users.week_starts_on`
 *   column to Phase 6.
 *
 * D-04 — disconnect surfacing:
 *   The persistent banner is rendered HERE (top of the page) when the
 *   token is revoked or not connected. The Settings nav badge (M-04) is
 *   rendered separately by PersistentNav via the
 *   `useGcalConnectionStatus()` hook so it shows on every page, not just
 *   /calendar.
 *
 * Visible-calendars (D-10):
 *   `users.gcal_visible_calendar_ids` (text[]; nullable) drives which
 *   calendars participate in the initial fetch. NULL means "show all"
 *   (no preference set) — defaults to every calendar returned by
 *   calendarList.list. The /calendar toolbar filter chips (`?cals=`) ship
 *   with Plan 04-04 and override this default per-session.
 */

import { startOfWeek, endOfWeek } from "date-fns";
import { eq } from "drizzle-orm";

import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getGcalConnectionStatus } from "@/lib/db/queries/gcal-connection";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";
import { listCalendars, type GcalCalendarMeta } from "@/lib/gcal/calendars";
import { eventToDTO, type GcalEventDTO } from "@/lib/gcal/event-dto";
import { CalendarClient } from "@/components/calendar/CalendarClient";
import { DisconnectBanner } from "@/components/calendar/DisconnectBanner";
import { EmptyState } from "@/components/calendar/EmptyState";

// Never cache — gcal is the source of truth (CAL-07).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CalendarPage() {
  const user = await requireOnboarded();

  const [statusResult, tzRow] = await Promise.all([
    getGcalConnectionStatus(user.id),
    db
      .select({
        tz: users.timezone,
        visibleCals: users.gcalVisibleCalendarIds,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
  ]);

  const userTimezone = tzRow[0]?.tz ?? null;
  const persistedVisibleCals = tzRow[0]?.visibleCals ?? null;

  if (statusResult === "not_connected") {
    return <EmptyState />;
  }

  // Fetch initial week's events (Mon-Sun) + calendar list in parallel. Wrap
  // in try/catch so revoked/disconnected refresh paths render the banner
  // instead of crashing the page.
  let initialEvents: GcalEventDTO[] = [];
  let calendars: GcalCalendarMeta[] = [];
  let bannerVariant: "revoked" | "not_connected" | null = null;

  try {
    const cal = await getValidGcalToken(user.id);
    const now = new Date();
    // Monday-start (RESEARCH Open Q 1 — hard-coded).
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const calendarList = await listCalendars(cal);
    calendars = calendarList;

    const visibleIds =
      persistedVisibleCals && persistedVisibleCals.length > 0
        ? persistedVisibleCals
        : calendarList.map((c) => c.id);
    const fetchTz = userTimezone ?? "UTC";

    const eventsPerCal = await Promise.all(
      visibleIds.map(async (cid) => {
        const { data } = await cal.events.list({
          calendarId: cid,
          timeMin: weekStart.toISOString(),
          timeMax: weekEnd.toISOString(),
          singleEvents: true, // Pitfall 10
          orderBy: "startTime",
          maxResults: 250,
          timeZone: fetchTz, // Pitfall 10
        });
        return (data.items ?? [])
          .map((e) => eventToDTO(e, cid))
          .filter((e): e is GcalEventDTO => e !== null);
      }),
    );
    initialEvents = eventsPerCal.flat();
  } catch (e) {
    if (e instanceof GcalTokenRevokedError) {
      bannerVariant = "revoked";
    } else if (e instanceof GcalNotConnectedError) {
      // Belt-and-suspenders: status check above should have caught this, but
      // a race between status read and token read is possible if the user
      // disconnects in another tab mid-load.
      bannerVariant = "not_connected";
    } else {
      throw e;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {bannerVariant && <DisconnectBanner variant={bannerVariant} />}
      <CalendarClient
        initialEvents={initialEvents}
        userId={user.id}
        userTimezone={userTimezone}
        calendars={calendars}
      />
    </div>
  );
}
