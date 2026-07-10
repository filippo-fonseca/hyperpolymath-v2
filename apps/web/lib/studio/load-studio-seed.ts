import "server-only";

import { startOfDay, addDays } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
} from "@/app/actions/habits";
import { getJournalEntry } from "@/app/actions/journal";
import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { getAreasForCurrentUser } from "@/app/actions/areas";
import { getPeopleForCurrentUser } from "@/app/actions/people";
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
import type { CalendarSeed, StudioSeed } from "@/components/studio/data/useStudioData";

/**
 * loadStudioSeed(userId) — the SSR seed for `/studio`.
 *
 * Fetches, in parallel, the same data the 2D surfaces seed (all tasks, captures,
 * gcal connection status, tz + visible-calendar prefs, habits, a trailing 14-day
 * completion window, today's journal entry), then resolves the gcal calendar
 * slab. The resolved seed hydrates the client's shared-key queries with no extra
 * round-trip, so the studio and the Page are one observer of the same cache.
 *
 * The gcal slab mirrors `/calendar/page.tsx`: if connected, `getValidGcalToken`
 * → `listCalendars` → per-calendar `events.list` over the rolling
 * `[startOfDay(today)-1d, +8d)` window (singleEvents/orderBy/timeZone), wrapped
 * in try/catch → status variants. gcal is the ONLY source of truth for events —
 * nothing is mirrored in Postgres, so the calling route must be `force-dynamic`.
 *
 * Local-ymd date math matches the studio provider's `todayYmd` client clock and
 * the 2D /habits + /journaling server pages, so the seeds hydrate byte-identically.
 */
export async function loadStudioSeed(userId: string): Promise<StudioSeed> {
  // Habits + journal seed dates in LOCAL time — byte-identical to the 2D
  // /habits (rolling 14-day window) and /journaling (today) server pages, and
  // to the studio provider's `todayYmd` client clock.
  const localToday = new Date();
  const toLocalYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const habitsWindowStartDate = new Date(localToday);
  habitsWindowStartDate.setDate(localToday.getDate() - 13);
  const localTodayYmd = toLocalYmd(localToday);
  const habitsWindowStartYmd = toLocalYmd(habitsWindowStartDate);

  const [
    tasks,
    captures,
    statusResult,
    tzRow,
    habits,
    habitCompletions,
    journalResult,
    projects,
    areas,
    people,
  ] = await Promise.all([
    getAllTasksForUser(userId),
    getCapturesForUser(userId),
    getGcalConnectionStatus(userId),
    db
      .select({
        tz: users.timezone,
        visibleCals: users.gcalVisibleCalendarIds,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    getHabitsForCurrentUser(),
    getHabitCompletionsInRange(habitsWindowStartYmd, localTodayYmd),
    getJournalEntry({ date: localTodayYmd }),
    getProjectsForCurrentUser(),
    getAreasForCurrentUser(),
    getPeopleForCurrentUser(),
  ]);

  const journal = journalResult.success ? journalResult.data : null;

  const calendarTz = tzRow[0]?.tz ?? "UTC";
  const persistedVisibleCals = tzRow[0]?.visibleCals ?? null;

  // The rolling slab: [startOfDay(today) - 1 day, startOfDay(today) + 8 days)
  // in the user's IANA timezone. TZDate keeps day math DST-correct.
  const todayInTz = startOfDay(new TZDate(Date.now(), calendarTz));
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
    // revoked/disconnected refresh path yields a quiet status instead of
    // crashing the route (mirrors /calendar's banner-variant handling).
    try {
      const cal = await getValidGcalToken(userId);
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
            timeZone: calendarTz, // DST correctness
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

  const calendar: CalendarSeed = {
    status,
    events,
    calendars,
    timezone: calendarTz,
    windowStartMs: windowStart.getTime(),
    windowEndMs: windowEnd.getTime(),
    visibleCalendarIds,
  };

  return {
    tasks,
    captures,
    calendar,
    habits,
    habitCompletions,
    journal,
    projects,
    areas,
    people,
  };
}
