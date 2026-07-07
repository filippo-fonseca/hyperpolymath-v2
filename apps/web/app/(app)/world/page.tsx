import { startOfDay, addDays } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { eq } from "drizzle-orm";

import { getUserOrRedirect } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import {
  getGcalConnectionStatus,
  type GcalConnectionStatus,
} from "@/lib/db/queries/gcal-connection";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";
import { listCalendars, type GcalCalendarMeta } from "@/lib/gcal/calendars";
import { eventToDTO, type GcalEventDTO } from "@/lib/gcal/event-dto";
import type { MeridianSeed } from "@/components/world/data/useWorldData";
import { WorldLoader } from "@/components/world/WorldLoader";

/**
 * /world — The Studiolo, the 3D theatre of the life-OS.
 *
 * Server Component. Lives in the authenticated `(app)` route group, so it
 * inherits the full provider stack from `(app)/layout.tsx` — auth gate,
 * QueryProvider (TanStack Query), NuqsAdapter, SearchProvider,
 * NavHistoryProvider, AppShell. The Canvas island therefore sits INSIDE the
 * existing QueryClient and reads the SAME shared caches the 2D app uses (no
 * parallel store).
 *
 * SSR-seeds the same data the 2D surfaces seed (active sidebar tree, all tasks,
 * captures) so the client island hydrates its shared-key queries with no extra
 * round-trip. All three-touching code lives behind WorldLoader's ssr:false
 * boundary — this file ships zero 3D bytes.
 *
 * Meridian seed (Phase 2 M-01) — the calendar sky:
 *   Mirrors `/calendar/page.tsx` exactly (the verified precedent): read
 *   connection status + timezone + visible-calendar prefs in parallel; if
 *   connected, `getValidGcalToken` → `listCalendars` → per-calendar
 *   `events.list` over the rolling `[startOfDay(today)-1d, +8d)` slab
 *   (`singleEvents`/`orderBy`/`timeZone`), wrapped in try/catch → status
 *   variants. gcal is the ONLY source of truth for events — nothing is mirrored
 *   in Postgres, so this route is `force-dynamic` (caching would surface stale
 *   events). The resolved seed hydrates the client meridian query with no extra
 *   client round-trip.
 */

// Never cache — gcal is the source of truth (no Postgres mirror).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorldPage() {
  const user = await getUserOrRedirect();

  const [initialTree, initialTasks, initialCaptures, statusResult, tzRow] =
    await Promise.all([
      getSidebarTree(user.id, false),
      getAllTasksForUser(user.id),
      getCapturesForUser(user.id),
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

  const meridianTz = tzRow[0]?.tz ?? "UTC";
  const persistedVisibleCals = tzRow[0]?.visibleCals ?? null;

  // The rolling slab: [startOfDay(today) - 1 day, startOfDay(today) + 8 days)
  // in the user's IANA timezone. TZDate keeps day math DST-correct.
  const todayInTz = startOfDay(new TZDate(Date.now(), meridianTz));
  const windowStart = addDays(todayInTz, -1);
  const windowEnd = addDays(todayInTz, 8);

  let status: GcalConnectionStatus = "connected";
  let events: GcalEventDTO[] = [];
  let calendars: GcalCalendarMeta[] = [];
  let visibleCalendarIds: string[] = [];

  if (statusResult === "not_connected") {
    status = "not_connected";
  } else {
    // Fetch calendars + this slab's events. Wrap in try/catch so a
    // revoked/disconnected refresh path yields a quiet-brass status instead of
    // crashing the route (mirrors /calendar's banner-variant handling).
    try {
      const cal = await getValidGcalToken(user.id);
      calendars = await listCalendars(cal);
      visibleCalendarIds =
        persistedVisibleCals && persistedVisibleCals.length > 0
          ? persistedVisibleCals
          : calendars.map((c) => c.id);

      const eventsPerCal = await Promise.all(
        visibleCalendarIds.map(async (cid) => {
          const { data } = await cal.events.list({
            calendarId: cid,
            timeMin: windowStart.toISOString(),
            timeMax: windowEnd.toISOString(),
            singleEvents: true, // expand recurring
            orderBy: "startTime",
            maxResults: 250,
            timeZone: meridianTz, // DST correctness
          });
          return (data.items ?? [])
            .map((e) => eventToDTO(e, cid))
            .filter((e): e is GcalEventDTO => e !== null);
        }),
      );
      events = eventsPerCal.flat();
    } catch (e) {
      if (e instanceof GcalTokenRevokedError) {
        status = "expired";
      } else if (e instanceof GcalNotConnectedError) {
        // Belt-and-suspenders: a race between the status read and the token
        // read is possible if the user disconnects in another tab mid-load.
        status = "not_connected";
      } else {
        throw e;
      }
    }
  }

  const initialMeridian: MeridianSeed = {
    status,
    events,
    calendars,
    timezone: meridianTz,
    windowStartMs: windowStart.getTime(),
    windowEndMs: windowEnd.getTime(),
    visibleCalendarIds,
  };

  return (
    <main
      className="relative min-h-full w-full overflow-hidden bg-[#120E0B]"
      style={{ height: "100%" }}
    >
      <WorldLoader
        userId={user.id}
        initialTree={initialTree}
        initialTasks={initialTasks}
        initialCaptures={initialCaptures}
        initialMeridian={initialMeridian}
      />
    </main>
  );
}
