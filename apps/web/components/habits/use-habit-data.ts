"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getHabitCompletionsInRange,
  getHabitDockToday,
  toggleHabitCompletion,
  type HabitDockToday,
} from "@/app/actions/habits";
import { tableKey } from "@/lib/realtime/query-keys";
import type { OptimisticAction } from "@/lib/realtime/optimistic-reducer";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import { sfx } from "@/lib/ui/sfx";

/**
 * The one data plane behind every habits surface — the /habits page and the
 * habits dock widget both consume these hooks, so the two can never disagree:
 * one mutation (`toggleHabitCompletion`), one completions cache entry per day,
 * one streak source (`getHabitDockToday`, itself built on
 * `lib/habits/streak.ts`).
 *
 * Invalidation contract (the round-trip budget): completions refresh rides the
 * realtime echo ALONE. A toggle never explicitly invalidates the completions
 * key, so the echo and an explicit invalidate cannot both fire — one refetch
 * per toggle, shared by every surface observing the entry. The optimistic
 * overlay (`useOptimisticList`) holds the row until canonical catches up, so a
 * slow echo cannot flash the check off and back on.
 */

/** Per-day completions entry. Today's is shared with the LifeOS tile
 * (`TodayHabitsWidget.tsx:44-48`) — same key, one cache entry. */
export function dayCompletionsKey(userId: string, dateISO: string) {
  return [...tableKey("habit_completions", userId), dateISO, dateISO] as const;
}

/**
 * Habit list + streak bases + 28-day rate for a given local date. Keyed under
 * the `habits` table prefix, so the habits realtime echo (and every explicit
 * `tableKey("habits", …)` invalidate, e.g. after HabitDialog saves) refreshes
 * it, while completions echoes — which fire on every toggle — do not.
 */
export function habitMetaKey(userId: string, todayISO: string) {
  return [...tableKey("habits", userId), "today-meta", todayISO] as const;
}

export function useHabitMeta(
  userId: string,
  todayISO: string,
  seed?: HabitDockToday,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: habitMetaKey(userId, todayISO),
    queryFn: () => getHabitDockToday(todayISO),
    enabled: options.enabled ?? true,
    ...(seed !== undefined ? { initialData: seed } : {}),
  });
}

type CompletionRow = { id: string; habitId: string; completedDate: string };

export type HabitDay = {
  /** Habit ids with a (possibly optimistic) done completion on this date. */
  doneSet: ReadonlySet<string>;
  /** One-tap toggle: optimistic flip, then the server action. */
  toggle: (habitId: string) => void;
  pending: boolean;
};

/**
 * Completion state for one local date, with the RT-06 optimistic overlay and
 * the shared toggle. `todayISO` rides along because a toggle on any OTHER day
 * (backfill) shifts streak bases and the 28-day rate, which live under
 * `habitMetaKey` and are not covered by the completions echo.
 */
export function useHabitDay(
  userId: string,
  dateISO: string,
  todayISO: string,
  seed?: { habitId: string; completedDate: string }[],
  options: { enabled?: boolean } = {},
): HabitDay {
  const queryClient = useQueryClient();

  const { data: canonical = [], isPending } = useQuery({
    queryKey: dayCompletionsKey(userId, dateISO),
    queryFn: () => getHabitCompletionsInRange(dateISO, dateISO),
    enabled: options.enabled ?? true,
    ...(seed !== undefined ? { initialData: seed } : {}),
  });

  const rows: CompletionRow[] = useMemo(
    () =>
      canonical.map((c) => ({
        ...c,
        id: `${c.habitId}::${c.completedDate}`,
      })),
    [canonical],
  );
  const [optimistic, dispatch] = useOptimisticList<CompletionRow>(rows);

  const doneSet = useMemo(
    () =>
      new Set(
        optimistic
          .filter((c) => c.completedDate === dateISO)
          .map((c) => c.habitId),
      ),
    [optimistic, dateISO],
  );

  const toggle = useCallback(
    (habitId: string) => {
      const key = `${habitId}::${dateISO}`;
      const next = !doneSet.has(habitId);

      // Space-console cue on completion only, never on un-check. No-op when
      // muted or while the shared AudioContext is still gesture-locked.
      if (next) sfx.play("habitCheck");

      const action: OptimisticAction<CompletionRow> = next
        ? { type: "insert", row: { id: key, habitId, completedDate: dateISO } }
        : { type: "delete", id: key };
      dispatch(action);

      void (async () => {
        const r = await toggleHabitCompletion({
          habitId,
          completedDate: dateISO,
          completed: next,
        });
        if (!r.success) {
          toast.error(r.error);
          dispatch({ type: "revert", id: key });
          return;
        }
        // No completions invalidate here — the realtime echo owns it (see the
        // module comment). Streak bases and the rate only shift when a day
        // other than today changed.
        if (dateISO !== todayISO) {
          void queryClient.invalidateQueries({
            queryKey: habitMetaKey(userId, todayISO),
          });
        }
      })();
    },
    [dateISO, todayISO, userId, doneSet, dispatch, queryClient],
  );

  return { doneSet, toggle, pending: isPending };
}
