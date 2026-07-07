"use client";

/**
 * StudioDataProvider.tsx — The Studio · data-bridge
 *
 * THE ONE SEAM between live app data and the 3D scene. There is NO world store:
 * this mounts the EXACT `useQuery` calls the 2D app already runs — same keys,
 * same queryFns, same Realtime hooks — so the world and the Page are two
 * observers of ONE TanStack Query cache. A completion on /tasks in another tab
 * reaches /world through the same invalidate→refetch path with zero new
 * plumbing.
 *
 * Query wiring (verbatim from the live 2D consumers):
 *   - areas:    key tableKey("areas", userId),  fn getAreasForCurrentUser   (Sidebar.tsx:132-144)
 *   - tasks:    key tableKey("tasks", userId),  fn getTasksForCurrentUser   (TasksClient.tsx:146-150)
 *   - captures: key [...tableKey("captures", userId), null], fn () => getCapturesForCurrentUser() (RecentCapturesWidget.tsx:38-42)
 *
 * MUST live INSIDE <Canvas> (useThree requires R3F context). Nothing here runs
 * per-frame; layout/slot solves are memoized on data identity; the differ is
 * O(n) with Maps.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useThree } from "@react-three/fiber";
import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import { getAreasForCurrentUser } from "@/app/actions/areas";
import { getTasksForCurrentUser } from "@/app/actions/tasks";
import { getCapturesForCurrentUser } from "@/app/actions/captures";
import { listEventsForUser } from "@/app/actions/gcal-events";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
  type HabitWithAreas,
} from "@/app/actions/habits";
import { getJournalEntry, type JournalEntry } from "@/app/actions/journal";
import {
  getHashtagsForUserAction,
  type HashtagWithCount,
} from "@/app/actions/hashtags";
import { addDaysISO } from "@/components/habits/date-utils";
import { useGcalConnectionStatus } from "@/lib/gcal/useGcalConnectionStatus";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { GcalConnectionStatus } from "@/lib/db/queries/gcal-connection";
import { solveTreeLayout, type EmberSlot } from "./treeLayout";
import { buildEmberSlots, todayYmd as computeTodayYmd } from "./mappings";
import { diffSnapshots, worldEvents } from "./diffing";
import {
  WorldDataContext,
  type WorldData,
  type CalendarData,
  type CalendarSeed,
  type HabitsData,
  type JournalTodayData,
  type HabitCompletionRow,
} from "./useStudioData";

interface StudioDataProviderProps {
  userId: string;
  initialTree: SidebarArea[]; // SSR seed: getSidebarTree(user.id, false)
  initialTasks: TaskWithProjects[]; // SSR seed: getAllTasksForUser(user.id)
  initialCaptures: CaptureWithLinks[]; // SSR seed: getCapturesForUser
  initialCalendar: CalendarSeed; // SSR seed: /world gcal read (M-01, renamed W-01)
  initialHabits: HabitWithAreas[]; // SSR seed: getHabitsForCurrentUser (W-01)
  initialHabitCompletions: HabitCompletionRow[]; // SSR seed: trailing-14d completions (W-01)
  initialJournal: JournalEntry | null; // SSR seed: today's journal entry (W-01)
  children: ReactNode;
}

export function StudioDataProvider({
  userId,
  initialTree,
  initialTasks,
  initialCaptures,
  initialCalendar,
  initialHabits,
  initialHabitCompletions,
  initialJournal,
  children,
}: StudioDataProviderProps) {
  // ── Realtime subscriptions (singleton channels; refcounted) ──────────────
  // The two fanouts route junction-table changes onto the queries that observe
  // them: a project rename/move must reach the areas tree; a task↔project link
  // change must re-solve lantern slots.
  useTableSubscription("areas", userId);
  useTableSubscription("projects", userId, {
    alsoInvalidate: [tableKey("areas", userId)],
  });
  useTableSubscription("tasks", userId);
  useTableSubscription("tasks_projects", userId, {
    alsoInvalidate: [tableKey("tasks", userId)],
  });
  useTableSubscription("captures", userId);

  // Phase 3 (W-01): the new bench-data channels, mirroring the exact 2D
  // subscriptions (HabitsClient, JournalingClient, CapturesClient) so the world
  // and the Page stay one observer of the same cache. Habits: the habits list,
  // the area-link junction (fanned onto the habits key), and completions.
  // Journal: journal_entries invalidates the whole ["journaling", userId]
  // prefix (the 2D client subscribes to it). Hashtags: the tag list + the
  // captures↔hashtags junction (fanned onto hashtags + captures) for the
  // Captures panel's tag chips (W-08 reads).
  useTableSubscription("habits", userId);
  useTableSubscription("habits_areas", userId, {
    alsoInvalidate: [tableKey("habits", userId)],
  });
  useTableSubscription("habit_completions", userId);
  useTableSubscription("journal_entries", userId);
  useTableSubscription("hashtags", userId);
  useTableSubscription("captures_hashtags", userId, {
    alsoInvalidate: [tableKey("hashtags", userId), tableKey("captures", userId)],
  });

  // ── Shared-cache reads (same keys/fns as the 2D app) ─────────────────────
  const { data: tree = initialTree } = useQuery({
    queryKey: tableKey("areas", userId),
    queryFn: getAreasForCurrentUser,
    initialData: initialTree,
    // Match Sidebar.tsx:136-141 — treat SSR initialData as fresh so an
    // invalidate on this key doesn't trigger a spurious immediate refetch.
    initialDataUpdatedAt: Date.now(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: tasks = initialTasks } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    initialData: initialTasks,
  });

  const { data: captures = initialCaptures } = useQuery({
    queryKey: [...tableKey("captures", userId), null] as const,
    queryFn: () => getCapturesForCurrentUser(),
    initialData: initialCaptures,
  });

  // ── todayYmd minute tick (§3.1) — re-render only at midnight ─────────────
  const [today, setToday] = useState(() => computeTodayYmd());
  useEffect(() => {
    const id = setInterval(() => {
      const next = computeTodayYmd();
      setToday((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── The calendar slice (M-01, renamed W-01) — gcal as a pure projection ──
  // The world adds ONE more slice of the SAME `["calendar-events", …]` query
  // key family the 2D `/calendar` uses (§1.2) — not a parallel store. Because
  // `invalidateAfterJarvisAction` invalidates the `["calendar-events", userId]`
  // PREFIX, a Jarvis "put lunch at noon Friday" (from any surface, any tab)
  // refetches this slice with zero new wiring. gcal is the only source of
  // truth for events — nothing here is mirrored in Postgres, and there is no
  // Realtime channel for events (nothing to broadcast); focus-refetch + the
  // 5-min foreground poll + the Jarvis prefix invalidation are the freshness
  // surfaces.
  const worldTz = initialCalendar.timezone;
  const worldCalIds = initialCalendar.visibleCalendarIds;

  // Window bounds ride the EXISTING `today` minute clock — ZERO new intervals.
  // `[startOfDay(today)-1d, startOfDay(today)+8d)` in the user's IANA tz (a
  // rolling ~9-day slab covering the ±7-day scrub range). When `today` rolls at
  // midnight the key changes → a natural daily refetch. TZDate keeps the day
  // math DST-correct (addDays operates on calendar days).
  const worldWindow = useMemo(() => {
    const [y, mo, d] = today.split("-").map(Number);
    const base = new TZDate(y ?? 1970, (mo ?? 1) - 1, d ?? 1, worldTz); // midnight today
    const start = addDays(base, -1);
    const end = addDays(base, 8);
    return {
      windowStartMs: start.getTime(),
      windowEndMs: end.getTime(),
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    };
  }, [today, worldTz]);

  const { data: calendarEvents = initialCalendar.events } = useQuery({
    queryKey: [
      "calendar-events",
      userId,
      worldCalIds.join(","),
      worldWindow.timeMin,
      worldWindow.timeMax,
    ] as const,
    queryFn: async () => {
      if (worldCalIds.length === 0) return [];
      const res = await listEventsForUser({
        calendarIds: worldCalIds,
        timeMin: worldWindow.timeMin,
        timeMax: worldWindow.timeMax,
      });
      // Map failure kinds → [] and let the shared connection-status key carry
      // the honest state (below), so the agenda and the Settings badge never
      // disagree. A refetch is a network event, not a frame.
      if (!res.success) return [];
      return res.data;
    },
    initialData: initialCalendar.events,
    // Treat the SSR seed as fresh so the agenda paints real events with NO extra
    // client round-trip on mount (matches the areas-query discipline above).
    initialDataUpdatedAt: Date.now(),
    enabled: worldCalIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });

  // Connection status: reuse the EXACT shared key (`["gcal-connection-status"]`)
  // the Settings badge uses, so disconnecting in Settings flips the agenda
  // within 60 s and the two never disagree (§1.2). Seed falls back to SSR.
  const { data: connStatus } = useGcalConnectionStatus();
  const calendarStatus: GcalConnectionStatus =
    connStatus ?? initialCalendar.status;

  // ── Habits slice (W-01, §1.2) — 2D keys/fns verbatim ─────────────────────
  // The habits list + a trailing 14-day completion window, keyed EXACTLY like
  // the 2D `/habits` client (HabitsClient.tsx:157-178). `windowStart` rides the
  // EXISTING `today` minute clock (addDaysISO(today, -13)) — ZERO new intervals.
  const habitsWindowStart = useMemo(() => addDaysISO(today, -13), [today]);

  const { data: habitRows = initialHabits } = useQuery({
    queryKey: tableKey("habits", userId),
    queryFn: getHabitsForCurrentUser,
    initialData: initialHabits,
  });

  const { data: habitCompletionRows = initialHabitCompletions } = useQuery({
    queryKey: [
      ...tableKey("habit_completions", userId),
      habitsWindowStart,
      today,
    ] as const,
    queryFn: () => getHabitCompletionsInRange(habitsWindowStart, today),
    initialData: initialHabitCompletions,
  });

  // ── Journal slice (W-01, §1.2) — today's entry only, keyed like the 2D
  // JournalingClient (["journaling", userId, selectedDate], selectedDate =
  // today here). Read-only in MVP; the server action returns an ActionResult,
  // so unwrap to the entry (or null) for the slice.
  const { data: journalResult } = useQuery({
    queryKey: ["journaling", userId, today] as const,
    queryFn: () => getJournalEntry({ date: today }),
    initialData: { success: true as const, data: initialJournal },
  });
  const journalEntry: JournalEntry | null = journalResult?.success
    ? journalResult.data
    : null;

  // ── Hashtags (W-01, §1.2) — tag chips for the Captures panel (W-08 reads).
  // Same key/fn as CapturesClient.tsx:166-169. No SSR seed (per build order);
  // fetches on mount and stays live via the hashtags/captures_hashtags channels.
  const { data: hashtags = [] } = useQuery({
    queryKey: tableKey("hashtags", userId),
    queryFn: () => getHashtagsForUserAction({ withCounts: true }),
  });

  // ── Memoized derivations on data identity ────────────────────────────────
  const layout = useMemo(() => solveTreeLayout(tree), [tree]);
  const emberSlots = useMemo(
    () => buildEmberSlots(tasks, layout, today),
    [tasks, layout, today],
  );

  // Calendar object identity memoized on its inputs (M-01 perf constraint):
  // the Agenda panel (W-09) reads `useStudioData().calendar` in render.
  const calendar = useMemo<CalendarData>(
    () => ({
      status: calendarStatus,
      events: calendarEvents,
      calendars: initialCalendar.calendars,
      timezone: worldTz,
      windowStartMs: worldWindow.windowStartMs,
      windowEndMs: worldWindow.windowEndMs,
    }),
    [
      calendarStatus,
      calendarEvents,
      initialCalendar.calendars,
      worldTz,
      worldWindow,
    ],
  );

  // Habits/journal slice identities memoized on their inputs (perf constraint):
  // the Habits (W-10) / Journal (W-11) panels read these in render.
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

  // ── Task snapshot differ → task-completed events (§4.2) ──────────────────
  const prevTasksRef = useRef<Map<string, TaskWithProjects> | null>(null);
  const prevSlotsRef = useRef<Map<string, EmberSlot>>(new Map());
  useEffect(() => {
    if (prevTasksRef.current !== null) {
      const diff = diffSnapshots(
        prevTasksRef.current,
        tasks,
        prevSlotsRef.current,
        today,
      );
      for (const tr of diff.completed) worldEvents.emit("task-completed", tr);
      // added/removed are consumed declaratively via the emberSlots array
      // (useStudioData); events are for one-shot choreography only.
    }
    prevTasksRef.current = new Map(tasks.map((t) => [t.id, t]));
    prevSlotsRef.current = new Map(emberSlots.map((s) => [s.taskId, s]));
  }, [tasks, emberSlots, today]);

  // ── Capture snapshot differ → capture-created events ─────────────────────
  const prevCaptureIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (prevCaptureIdsRef.current !== null) {
      const prevIds = prevCaptureIdsRef.current;
      for (const c of captures) {
        if (!prevIds.has(c.id)) {
          worldEvents.emit("capture-created", { captureId: c.id });
        }
      }
    }
    prevCaptureIdsRef.current = new Set(captures.map((c) => c.id));
  }, [captures]);

  // ── Demand-mode frame on data change (§1.6) ──────────────────────────────
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [
    tree,
    tasks,
    captures,
    calendarEvents,
    habitRows,
    habitCompletionRows,
    journalEntry,
    hashtags,
    invalidate,
  ]);

  const value = useMemo<WorldData>(
    () => ({
      userId,
      tree,
      layout,
      tasks,
      emberSlots,
      captures,
      todayYmd: today,
      calendar,
      habits,
      journal,
      hashtags,
    }),
    [
      userId,
      tree,
      layout,
      tasks,
      emberSlots,
      captures,
      today,
      calendar,
      habits,
      journal,
      hashtags,
    ],
  );

  return (
    <WorldDataContext.Provider value={value}>
      {children}
    </WorldDataContext.Provider>
  );
}
