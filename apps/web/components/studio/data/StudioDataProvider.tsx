"use client";

/**
 * StudioDataProvider.tsx — The Studio · data-bridge
 *
 * THE ONE SEAM between live app data and the studio. There is NO studio store:
 * this mounts the EXACT `useQuery` calls the 2D app already runs — same keys,
 * same queryFns, same Realtime hooks — so the studio and the Page are two
 * observers of ONE TanStack Query cache. A completion on /tasks in another tab
 * reaches /studio through the same invalidate→refetch path with zero new
 * plumbing.
 *
 * MOUNTS ABOVE the R3F <Canvas>. R3F v9 bridges parent React context into the
 * Canvas root automatically, so a plain-React provider serves BOTH the
 * in-Canvas `widget-cloud` and the DOM `focus-overlay`. Nothing here touches
 * three/R3F — demand-frame invalidation on data change is the widget-cloud's
 * job (it owns the `useThree(s => s.invalidate)` nudge).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import { getTasksForCurrentUser } from "@/app/actions/tasks";
import { getCapturesForCurrentUser } from "@/app/actions/captures";
import { listEventsForUser } from "@/app/actions/gcal-events";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
} from "@/app/actions/habits";
import { getJournalEntry, type JournalEntry } from "@/app/actions/journal";
import { getHashtagsForUserAction } from "@/app/actions/hashtags";
import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { getAreasForCurrentUser } from "@/app/actions/areas";
import { getPeopleForCurrentUser } from "@/app/actions/people";
import { addDaysISO } from "@/components/habits/date-utils";
import { toYmd } from "@/lib/tasks/date-shortcuts";
import { useGcalConnectionStatus } from "@/lib/gcal/useGcalConnectionStatus";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type { GcalConnectionStatus } from "@/lib/db/queries/gcal-connection";
import {
  StudioDataContext,
  type StudioData,
  type StudioSeed,
  type CalendarData,
  type HabitsData,
  type JournalTodayData,
} from "./useStudioData";

/** Today in the user's local timezone as a `YYYY-MM-DD` string. */
function computeTodayYmd(): string {
  return toYmd(new Date());
}

interface StudioDataProviderProps {
  userId: string;
  seed: StudioSeed;
  children: ReactNode;
}

export function StudioDataProvider({
  userId,
  seed,
  children,
}: StudioDataProviderProps) {
  // ── Realtime subscriptions (singleton channels; refcounted) ──────────────
  // Junction-table channels fan onto the queries that observe them so a link
  // change (task↔project, capture↔project/hashtag, habit↔area) reaches the
  // right slice. Journal fans onto the 2D `["journaling", userId]` prefix — the
  // key the studio journal query and the 2D client actually use (the historical
  // `["journal_entries", …]` key never matched anything; D-10 fanout fixes it).
  useTableSubscription("tasks", userId);
  useTableSubscription("tasks_projects", userId, {
    alsoInvalidate: [tableKey("tasks", userId)],
  });
  useTableSubscription("captures", userId);
  useTableSubscription("captures_hashtags", userId, {
    alsoInvalidate: [tableKey("hashtags", userId), tableKey("captures", userId)],
  });
  useTableSubscription("captures_projects", userId, {
    alsoInvalidate: [tableKey("captures", userId)],
  });
  useTableSubscription("hashtags", userId);
  useTableSubscription("habits", userId);
  useTableSubscription("habits_areas", userId, {
    alsoInvalidate: [tableKey("habits", userId)],
  });
  useTableSubscription("habit_completions", userId);
  useTableSubscription("journal_entries", userId, {
    alsoInvalidate: [["journaling", userId]],
  });
  // Wave-5 ambient widgets. Projects/areas are subscribed directly here (the
  // existing `tasks_projects`/`captures_projects` channels fan onto tasks/
  // captures, never the `projects` table itself). People mirrors PeopleClient:
  // the reference-junction channel fans onto the people slice so a mention
  // change re-counts references.
  useTableSubscription("projects", userId);
  useTableSubscription("areas", userId);
  useTableSubscription("people", userId);
  useTableSubscription("people_references", userId, {
    alsoInvalidate: [tableKey("people", userId)],
  });

  // ── Shared-cache reads (same keys/fns as the 2D app) ─────────────────────
  const { data: tasks = seed.tasks } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    initialData: seed.tasks,
  });

  const { data: captures = seed.captures } = useQuery({
    queryKey: [...tableKey("captures", userId), null] as const,
    queryFn: () => getCapturesForCurrentUser(),
    initialData: seed.captures,
  });

  // ── todayYmd minute tick — re-render only at midnight ────────────────────
  const [today, setToday] = useState(() => computeTodayYmd());
  useEffect(() => {
    const id = setInterval(() => {
      const next = computeTodayYmd();
      setToday((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── The calendar slice — gcal as a pure projection ───────────────────────
  // ONE more slice of the SAME `["calendar-events", …]` query key family the 2D
  // `/calendar` uses — not a parallel store. Because `invalidateAfterJarvisAction`
  // invalidates the `["calendar-events", userId]` PREFIX, a Jarvis event edit
  // from any surface refetches this slice with zero new wiring. gcal is the only
  // source of truth for events; there is no Realtime channel for events —
  // focus-refetch + the 5-min foreground poll + prefix invalidation are the
  // freshness surfaces.
  const tz = seed.calendar.timezone;
  const calIds = seed.calendar.visibleCalendarIds;

  // Window bounds ride the EXISTING `today` minute clock — ZERO new intervals.
  // `[startOfDay(today)-1d, startOfDay(today)+8d)` in the user's IANA tz. TZDate
  // keeps day math DST-correct.
  const window = useMemo(() => {
    const [y, mo, d] = today.split("-").map(Number);
    const base = new TZDate(y ?? 1970, (mo ?? 1) - 1, d ?? 1, tz); // midnight today
    const start = addDays(base, -1);
    const end = addDays(base, 8);
    return {
      windowStartMs: start.getTime(),
      windowEndMs: end.getTime(),
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    };
  }, [today, tz]);

  const { data: calendarEvents = seed.calendar.events } = useQuery({
    queryKey: [
      "calendar-events",
      userId,
      calIds.join(","),
      window.timeMin,
      window.timeMax,
    ] as const,
    queryFn: async () => {
      if (calIds.length === 0) return [];
      const res = await listEventsForUser({
        calendarIds: calIds,
        timeMin: window.timeMin,
        timeMax: window.timeMax,
      });
      // Map failure kinds → [] and let the shared connection-status key carry
      // the honest state (below), so the agenda and the Settings badge never
      // disagree.
      if (!res.success) return [];
      return res.data;
    },
    initialData: seed.calendar.events,
    // Treat the SSR seed as fresh so the agenda paints real events with NO extra
    // client round-trip on mount.
    initialDataUpdatedAt: Date.now(),
    enabled: calIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });

  // Connection status: reuse the EXACT shared key (`["gcal-connection-status"]`)
  // the Settings badge uses, so disconnecting in Settings flips the agenda
  // within 60s and the two never disagree. Seed falls back to SSR.
  const { data: connStatus } = useGcalConnectionStatus();
  const calendarStatus: GcalConnectionStatus =
    connStatus ?? seed.calendar.status;

  // ── Habits slice — 2D keys/fns verbatim ──────────────────────────────────
  // The habits list + a trailing 14-day completion window, keyed EXACTLY like
  // the 2D `/habits` client. `windowStart` rides the EXISTING `today` clock.
  const habitsWindowStart = useMemo(() => addDaysISO(today, -13), [today]);

  const { data: habitRows = seed.habits } = useQuery({
    queryKey: tableKey("habits", userId),
    queryFn: getHabitsForCurrentUser,
    initialData: seed.habits,
  });

  const { data: habitCompletionRows = seed.habitCompletions } = useQuery({
    queryKey: [
      ...tableKey("habit_completions", userId),
      habitsWindowStart,
      today,
    ] as const,
    queryFn: () => getHabitCompletionsInRange(habitsWindowStart, today),
    initialData: seed.habitCompletions,
  });

  // ── Journal slice — today's entry only, keyed like the 2D JournalingClient.
  const { data: journalResult } = useQuery({
    queryKey: ["journaling", userId, today] as const,
    queryFn: () => getJournalEntry({ date: today }),
    initialData: { success: true as const, data: seed.journal },
  });
  const journalEntry: JournalEntry | null = journalResult?.success
    ? journalResult.data
    : null;

  // ── Hashtags — tag chips for the Captures overlay. Same key/fn as the 2D
  // CapturesClient. No SSR seed; fetches on mount, stays live via the
  // hashtags/captures_hashtags channels.
  const { data: hashtags = [] } = useQuery({
    queryKey: tableKey("hashtags", userId),
    queryFn: () => getHashtagsForUserAction({ withCounts: true }),
  });

  // ── Projects / Areas / People — same keys/fns as the 2D pages (Sidebar,
  // ProjectDetailClient, PeopleClient). Hashtags precedent: no SSR seed, fetch
  // on mount, `[]` until first paint. Tiles are pure summaries over these.
  const { data: projects = [] } = useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: () => getProjectsForCurrentUser(),
  });

  const { data: areas = [] } = useQuery({
    queryKey: tableKey("areas", userId),
    queryFn: getAreasForCurrentUser,
  });

  const { data: people = [] } = useQuery({
    queryKey: tableKey("people", userId),
    queryFn: getPeopleForCurrentUser,
  });

  // ── Memoized slice identities on data inputs ─────────────────────────────
  const calendar = useMemo<CalendarData>(
    () => ({
      status: calendarStatus,
      events: calendarEvents,
      calendars: seed.calendar.calendars,
      timezone: tz,
      windowStartMs: window.windowStartMs,
      windowEndMs: window.windowEndMs,
    }),
    [calendarStatus, calendarEvents, seed.calendar.calendars, tz, window],
  );

  const habits = useMemo<HabitsData>(
    () => ({
      habits: habitRows,
      completions: habitCompletionRows,
      windowStart: habitsWindowStart,
    }),
    [habitRows, habitCompletionRows, habitsWindowStart],
  );

  const journal = useMemo<JournalTodayData>(
    () => ({ entry: journalEntry }),
    [journalEntry],
  );

  const value = useMemo<StudioData>(
    () => ({
      userId,
      todayYmd: today,
      tasks,
      captures,
      hashtags,
      calendar,
      habits,
      journal,
      projects,
      areas,
      people,
    }),
    [
      userId,
      today,
      tasks,
      captures,
      hashtags,
      calendar,
      habits,
      journal,
      projects,
      areas,
      people,
    ],
  );

  return (
    <StudioDataContext.Provider value={value}>
      {children}
    </StudioDataContext.Provider>
  );
}
