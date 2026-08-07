"use client";

import {
  type HabitDockToday,
  getHabitCompletionsInRange,
  getHabitDockToday,
  setHabitCompletionStatus,
} from "@/app/actions/habits";
import { type HabitStatus, nextHabitStatus } from "@/lib/habits/status";
import type { OptimisticAction } from "@/lib/realtime/optimistic-reducer";
import { tableKey } from "@/lib/realtime/query-keys";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import { sfx } from "@/lib/ui/sfx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

/**
 * The one data plane behind every habits surface — the /habits page and the
 * habits dock widget both consume these hooks, so the two can never disagree:
 * one mutation (`setHabitCompletionStatus`), one completions cache entry per day,
 * one streak source (`getHabitDockToday`, itself built on
 * `lib/habits/streak.ts`).
 *
 * Invalidation contract (the round-trip budget): one refetch per toggle,
 * shared by every surface observing the entry, with ownership split by
 * direction. A CHECK (insert) rides the realtime echo alone. An UN-CHECK
 * (delete) is explicitly invalidated here, because postgres_changes DELETE
 * events never reach a user-filtered channel on these tables: with the
 * default replica identity the WAL old-record carries only the PK, so
 * Realtime cannot evaluate the `user_id=eq.` filter and drops the event
 * (fixing that needs a REPLICA IDENTITY FULL migration, queued as a
 * follow-up). The two owners cannot double-fire, so the budget holds. The
 * optimistic overlay (`useOptimisticList`) holds the row until canonical
 * catches up, so a slow echo cannot flash the check off and back on.
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
  options: { enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: habitMetaKey(userId, todayISO),
    queryFn: () => getHabitDockToday(todayISO),
    enabled: options.enabled ?? true,
    ...(seed !== undefined ? { initialData: seed } : {}),
  });
}

type CompletionRow = {
  id: string;
  habitId: string;
  completedDate: string;
  status: HabitStatus;
};

export type HabitDay = {
  /** Habit ids with a (possibly optimistic) DONE completion on this date. */
  doneSet: ReadonlySet<string>;
  /** Where each habit sits on the ladder; absent id = `not_started`. */
  statusOf: (habitId: string) => HabitStatus;
  /** Advance one rung: not started → started → almost → done → not started. */
  advance: (habitId: string) => void;
  /** Jump straight to a rung (used by surfaces with an explicit control). */
  setStatus: (habitId: string, status: HabitStatus) => void;
  /** Binary shorthand kept for callers that only mean done/not-done. */
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
  seed?: { habitId: string; completedDate: string; status: HabitStatus }[],
  options: { enabled?: boolean } = {}
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
    [canonical]
  );
  const [optimistic, dispatch] = useOptimisticList<CompletionRow>(rows);

  const statusMap = useMemo(() => {
    const m = new Map<string, HabitStatus>();
    for (const c of optimistic) {
      if (c.completedDate === dateISO) m.set(c.habitId, c.status);
    }
    return m;
  }, [optimistic, dateISO]);

  const statusOf = useCallback(
    (habitId: string): HabitStatus => statusMap.get(habitId) ?? "not_started",
    [statusMap]
  );

  const doneSet = useMemo(() => {
    const s = new Set<string>();
    for (const [habitId, status] of statusMap) {
      if (status === "done") s.add(habitId);
    }
    return s;
  }, [statusMap]);

  const setStatus = useCallback(
    (habitId: string, next: HabitStatus) => {
      const key = `${habitId}::${dateISO}`;
      const current = statusMap.get(habitId) ?? "not_started";
      if (next === current) return;

      // Space-console cue on completion only — never on a partial rung, never
      // on clearing. No-op when muted or while the shared AudioContext is
      // still gesture-locked.
      if (next === "done") sfx.play("habitCheck");

      // Three optimistic shapes, because the row itself may or may not exist:
      // clearing deletes it, arriving from `not_started` inserts it, and every
      // move between two partial rungs patches the one already there.
      const action: OptimisticAction<CompletionRow> =
        next === "not_started"
          ? { type: "delete", id: key }
          : current === "not_started"
            ? {
                type: "insert",
                row: { id: key, habitId, completedDate: dateISO, status: next },
              }
            : { type: "update", id: key, patch: { status: next } };
      dispatch(action);

      void (async () => {
        const r = await setHabitCompletionStatus({
          habitId,
          completedDate: dateISO,
          status: next,
        });
        if (!r.success) {
          toast.error(r.error);
          dispatch({ type: "revert", id: key });
          return;
        }
        // Ownership split per the module comment: the echo covers inserts;
        // deletes never echo (replica identity), so clearing invalidates. An
        // UPDATE echo does reach the channel (the new record carries user_id),
        // but the overlay holds the patch until it lands either way.
        if (next === "not_started") {
          void queryClient.invalidateQueries({
            queryKey: dayCompletionsKey(userId, dateISO),
          });
        }
        // Streak bases and the rate live under habitMetaKey. A backfill on any
        // other day shifts them; so does today crossing into or out of `done`,
        // which the completions echo alone does not cover.
        if (dateISO !== todayISO || next === "done" || current === "done") {
          void queryClient.invalidateQueries({
            queryKey: habitMetaKey(userId, todayISO),
          });
        }
      })();
    },
    [dateISO, todayISO, userId, statusMap, dispatch, queryClient]
  );

  const advance = useCallback(
    (habitId: string) => {
      setStatus(habitId, nextHabitStatus(statusMap.get(habitId) ?? "not_started"));
    },
    [setStatus, statusMap]
  );

  const toggle = useCallback(
    (habitId: string) => {
      setStatus(habitId, doneSet.has(habitId) ? "not_started" : "done");
    },
    [setStatus, doneSet]
  );

  return { doneSet, statusOf, advance, setStatus, toggle, pending: isPending };
}
