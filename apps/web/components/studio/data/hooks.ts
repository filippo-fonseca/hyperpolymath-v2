"use client";

/**
 * hooks.ts — The Studio · Wave-2 consumer contract
 *
 * ── For Wave-2 units ────────────────────────────────────────────────────────
 * • `widget-cloud` → `useStudioSummaries()`: one call, five tiles in stable
 *   order. Because the Canvas runs `frameloop="demand"`, widget-cloud MUST nudge
 *   a frame when the summaries change —
 *     `const invalidate = useThree(s => s.invalidate);
 *      useEffect(() => invalidate(), [summaries]);`
 *   — or switch the Canvas to `frameloop="always"`. The data provider no longer
 *   drives invalidation (it lives outside the Canvas).
 * • `focus-overlay` → the five `useStudio<Widget>()` hooks: full collection +
 *   summary + actions per widget.
 * Both must render inside `<StudioDataProvider>`, which StudioLoader mounts above
 * the Canvas. In-Canvas consumers get the context via R3F v9's context bridge.
 *
 * Each hook = `useStudioData()` + a memoized `summarize*` selector (a pure
 * projection, NOT a second query) + a module-const action bundle. Agenda's
 * write actions are wrapped to invalidate the `["calendar-events", userId]`
 * prefix on success (no gcal Realtime channel exists).
 */
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { HashtagWithCount } from "@/app/actions/hashtags";
import {
  createEvent,
  updateEvent,
  deleteEvent,
} from "@/app/actions/gcal-events";
import { useStudioData } from "./useStudioData";
import type {
  CalendarData,
  HabitsData,
  JournalTodayData,
  StudioTileSummary,
} from "./useStudioData";
import {
  summarizeAgenda,
  summarizeCaptures,
  summarizeHabits,
  summarizeJournal,
  summarizeTasks,
} from "./summaries";
import {
  studioCaptureActions,
  studioHabitActions,
  studioJournalActions,
  studioTaskActions,
  type StudioCaptureActions,
  type StudioHabitActions,
  type StudioJournalActions,
  type StudioTaskActions,
} from "./actions";

// ── Tasks ─────────────────────────────────────────────────────────────────────
export function useStudioTasks(): {
  tasks: TaskWithProjects[];
  todayYmd: string;
  summary: StudioTileSummary;
  actions: StudioTaskActions;
} {
  const { tasks, todayYmd } = useStudioData();
  const summary = useMemo(
    () => summarizeTasks(tasks, todayYmd),
    [tasks, todayYmd],
  );
  return { tasks, todayYmd, summary, actions: studioTaskActions };
}

// ── Captures ────────────────────────────────────────────────────────────────────
export function useStudioCaptures(): {
  captures: CaptureWithLinks[];
  hashtags: HashtagWithCount[];
  todayYmd: string;
  summary: StudioTileSummary;
  actions: StudioCaptureActions;
} {
  const { captures, hashtags, todayYmd } = useStudioData();
  const summary = useMemo(
    () => summarizeCaptures(captures, todayYmd),
    [captures, todayYmd],
  );
  return { captures, hashtags, todayYmd, summary, actions: studioCaptureActions };
}

// ── Agenda ────────────────────────────────────────────────────────────────────
export interface StudioAgendaActions {
  createEvent: (
    input: Parameters<typeof createEvent>[0],
  ) => ReturnType<typeof createEvent>;
  updateEvent: (
    input: Parameters<typeof updateEvent>[0],
  ) => ReturnType<typeof updateEvent>;
  deleteEvent: (
    input: Parameters<typeof deleteEvent>[0],
  ) => ReturnType<typeof deleteEvent>;
}

export function useStudioAgenda(): {
  calendar: CalendarData;
  todayYmd: string;
  summary: StudioTileSummary;
  actions: StudioAgendaActions;
} {
  const { calendar, todayYmd, userId } = useStudioData();
  const queryClient = useQueryClient();

  // `nowMs` recomputes on each `todayYmd` minute tick — a tile summary that is
  // ≤ 60s stale is fine, and this avoids per-render Date.now() churn breaking
  // the memo identity.
  const nowMs = useMemo(() => Date.now(), [todayYmd]);
  const summary = useMemo(
    () => summarizeAgenda(calendar, nowMs),
    [calendar, nowMs],
  );

  // gcal has no Realtime channel — invalidate the shared events prefix on any
  // successful write so this slab (and /calendar) refetch.
  const invalidateEvents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["calendar-events", userId] });
  }, [queryClient, userId]);

  const actions = useMemo<StudioAgendaActions>(
    () => ({
      createEvent: async (input) => {
        const res = await createEvent(input);
        if (res.success) invalidateEvents();
        return res;
      },
      updateEvent: async (input) => {
        const res = await updateEvent(input);
        if (res.success) invalidateEvents();
        return res;
      },
      deleteEvent: async (input) => {
        const res = await deleteEvent(input);
        if (res.success) invalidateEvents();
        return res;
      },
    }),
    [invalidateEvents],
  );

  return { calendar, todayYmd, summary, actions };
}

// ── Habits ────────────────────────────────────────────────────────────────────
export function useStudioHabits(): {
  habits: HabitsData;
  todayYmd: string;
  summary: StudioTileSummary;
  actions: StudioHabitActions;
} {
  const { habits, todayYmd } = useStudioData();
  const summary = useMemo(
    () => summarizeHabits(habits, todayYmd),
    [habits, todayYmd],
  );
  return { habits, todayYmd, summary, actions: studioHabitActions };
}

// ── Journal ───────────────────────────────────────────────────────────────────
export function useStudioJournal(): {
  journal: JournalTodayData;
  todayYmd: string;
  summary: StudioTileSummary;
  actions: StudioJournalActions;
} {
  const { journal, todayYmd } = useStudioData();
  const summary = useMemo(() => summarizeJournal(journal), [journal]);
  return { journal, todayYmd, summary, actions: studioJournalActions };
}

// ── Widget-cloud convenience — five tiles, stable order ─────────────────────────
export function useStudioSummaries(): StudioTileSummary[] {
  const { tasks, captures, calendar, habits, journal, todayYmd } =
    useStudioData();

  const nowMs = useMemo(() => Date.now(), [todayYmd]);

  const tasksSummary = useMemo(
    () => summarizeTasks(tasks, todayYmd),
    [tasks, todayYmd],
  );
  const capturesSummary = useMemo(
    () => summarizeCaptures(captures, todayYmd),
    [captures, todayYmd],
  );
  const agendaSummary = useMemo(
    () => summarizeAgenda(calendar, nowMs),
    [calendar, nowMs],
  );
  const habitsSummary = useMemo(
    () => summarizeHabits(habits, todayYmd),
    [habits, todayYmd],
  );
  const journalSummary = useMemo(() => summarizeJournal(journal), [journal]);

  return useMemo(
    () => [
      tasksSummary,
      capturesSummary,
      agendaSummary,
      habitsSummary,
      journalSummary,
    ],
    [
      tasksSummary,
      capturesSummary,
      agendaSummary,
      habitsSummary,
      journalSummary,
    ],
  );
}
