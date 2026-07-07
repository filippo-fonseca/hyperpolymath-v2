"use client";

/**
 * WorldDataProvider.tsx — U-04 · The Studiolo · data-bridge
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
  type MeridianData,
  type MeridianSeed,
} from "./useWorldData";

interface WorldDataProviderProps {
  userId: string;
  initialTree: SidebarArea[]; // SSR seed: getSidebarTree(user.id, false)
  initialTasks: TaskWithProjects[]; // SSR seed: getAllTasksForUser(user.id)
  initialCaptures: CaptureWithLinks[]; // SSR seed: getCapturesForUser
  initialMeridian: MeridianSeed; // SSR seed: /world gcal read (M-01)
  children: ReactNode;
}

export function WorldDataProvider({
  userId,
  initialTree,
  initialTasks,
  initialCaptures,
  initialMeridian,
  children,
}: WorldDataProviderProps) {
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

  // ── The Meridian Ring slice (M-01) — gcal as a pure projection ───────────
  // The world adds ONE more slice of the SAME `["calendar-events", …]` query
  // key family the 2D `/calendar` uses (§1.2) — not a parallel store. Because
  // `invalidateAfterJarvisAction` invalidates the `["calendar-events", userId]`
  // PREFIX, a Jarvis "put lunch at noon Friday" (from any surface, any tab)
  // refetches this slice with zero new wiring. gcal is the only source of
  // truth for events — nothing here is mirrored in Postgres, and there is no
  // Realtime channel for events (nothing to broadcast); focus-refetch + the
  // 5-min foreground poll + the Jarvis prefix invalidation are the freshness
  // surfaces.
  const worldTz = initialMeridian.timezone;
  const worldCalIds = initialMeridian.visibleCalendarIds;

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

  const { data: meridianEvents = initialMeridian.events } = useQuery({
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
      // the honest state (below), so the ring and the Settings badge never
      // disagree. A refetch is a network event, not a frame.
      if (!res.success) return [];
      return res.data;
    },
    initialData: initialMeridian.events,
    // Treat the SSR seed as fresh so the ring paints real events with NO extra
    // client round-trip on mount (matches the areas-query discipline above).
    initialDataUpdatedAt: Date.now(),
    enabled: worldCalIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });

  // Connection status: reuse the EXACT shared key (`["gcal-connection-status"]`)
  // the Settings badge uses, so disconnecting in Settings flips the ring within
  // 60 s and the two never disagree (§1.2). Seed falls back to the SSR status.
  const { data: connStatus } = useGcalConnectionStatus();
  const meridianStatus: GcalConnectionStatus =
    connStatus ?? initialMeridian.status;

  // ── Memoized derivations on data identity ────────────────────────────────
  const layout = useMemo(() => solveTreeLayout(tree), [tree]);
  const emberSlots = useMemo(
    () => buildEmberSlots(tasks, layout, today),
    [tasks, layout, today],
  );

  // Meridian object identity memoized on its inputs (M-01 perf constraint):
  // downstream ring/tablet systems read `useWorldData().meridian` in render.
  const meridian = useMemo<MeridianData>(
    () => ({
      status: meridianStatus,
      events: meridianEvents,
      calendars: initialMeridian.calendars,
      timezone: worldTz,
      windowStartMs: worldWindow.windowStartMs,
      windowEndMs: worldWindow.windowEndMs,
    }),
    [
      meridianStatus,
      meridianEvents,
      initialMeridian.calendars,
      worldTz,
      worldWindow,
    ],
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
      // (useWorldData); events are for one-shot choreography only.
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
  }, [tree, tasks, captures, meridianEvents, invalidate]);

  const value = useMemo<WorldData>(
    () => ({
      userId,
      tree,
      layout,
      tasks,
      emberSlots,
      captures,
      todayYmd: today,
      meridian,
    }),
    [userId, tree, layout, tasks, emberSlots, captures, today, meridian],
  );

  return (
    <WorldDataContext.Provider value={value}>
      {children}
    </WorldDataContext.Provider>
  );
}
