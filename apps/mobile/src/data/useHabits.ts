// Habits data layer. Mirrors web semantics (REBUILD.md):
//   - denominator = today's *scheduled* habits (daysOfWeek[getDay()])
//   - absence of a completion row = not done
//   - streaks are schedule-aware, today is forgiven, only done days count
//
// Device-API limitation, noted for parity: the web habit ladder has four
// rungs (not_started → in_progress → almost_done → done) but the device
// endpoint only exposes a binary PUT toggle, and its completions payload
// carries no status column. Mobile therefore models done/not-done;
// advance() is a done↔not_started toggle until the device API grows the
// ladder.

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  createHabit,
  deleteHabit,
  getHabits,
  localDateString,
  toggleHabit,
  updateHabit,
  type Habit,
  type HabitCompletion,
  type HabitData,
} from "../api/device";
import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

export type { Habit, HabitCompletion, HabitData };

/** Days of window fetched for streak context (4 weeks + today). */
const STREAK_WINDOW_DAYS = 28;

function shiftISO(dateISO: string, offsetDays: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + offsetDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function dayOfWeekISO(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
}

async function fetchHabits(start: string, end: string): Promise<HabitData> {
  const data = await getHabits(start, end);
  if (data === null) throw new Error("habits fetch failed");
  return data;
}

export function useHabits(start: string, end: string) {
  return useQuery({
    queryKey: queryKeys.habits(start, end),
    queryFn: () => fetchHabits(start, end),
  });
}

export interface StreakResult {
  /** Confirmed chain through yesterday, plus today's credit if done. */
  current: number;
  /** True when the walk hit the fetched window edge while still counting —
   * the real streak is at least `current`. */
  saturated: boolean;
}

/**
 * Schedule-aware streak: unscheduled days are transparent, an unchecked
 * today never breaks the chain, only done days extend it.
 */
export function computeStreak(
  habit: Habit,
  doneDates: ReadonlySet<string>,
  todayISO: string,
  windowStartISO: string,
): StreakResult {
  let streak = 0;
  // Today: forgiven if unchecked, credited if done (when scheduled).
  if (habit.daysOfWeek[dayOfWeekISO(todayISO)] && doneDates.has(todayISO)) {
    streak += 1;
  }
  let cursor = shiftISO(todayISO, -1);
  while (cursor >= windowStartISO) {
    if (habit.daysOfWeek[dayOfWeekISO(cursor)]) {
      if (!doneDates.has(cursor)) return { current: streak, saturated: false };
      streak += 1;
    }
    cursor = shiftISO(cursor, -1);
  }
  return { current: streak, saturated: true };
}

export interface HabitDayRow {
  habit: Habit;
  /** Scheduled for the requested day. */
  scheduledToday: boolean;
  doneToday: boolean;
  streak: StreakResult;
}

export interface HabitDay {
  rows: HabitDayRow[];
  /** Rows scheduled today, in orderIndex order — the visible list. */
  today: HabitDayRow[];
  doneCount: number;
  scheduledCount: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** Binary toggle (see module note on the ladder limitation). */
  toggle: (habitId: string) => void;
  togglePending: boolean;
}

/** One-day view for a given local date with a 28-day streak window. */
export function useHabitDay(todayISO: string = localDateString(0)): HabitDay {
  const windowStart = shiftISO(todayISO, -(STREAK_WINDOW_DAYS - 1));
  const query = useHabits(windowStart, todayISO);
  const habitsKey = queryKeys.habits(windowStart, todayISO);

  const toggleMutation = useMutation({
    mutationFn: async (args: { habitId: string; completed: boolean }) => {
      const ok = await toggleHabit({
        habitId: args.habitId,
        completedDate: todayISO,
        completed: args.completed,
      });
      if (!ok) throw new Error("toggle habit failed");
    },
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: habitsKey });
      const prev = queryClient.getQueryData<HabitData>(habitsKey);
      queryClient.setQueryData<HabitData>(habitsKey, (data) => {
        if (!data) return data;
        const without = data.completions.filter(
          (c) => !(c.habitId === args.habitId && c.completedDate === todayISO),
        );
        return {
          ...data,
          completions: args.completed
            ? [...without, { habitId: args.habitId, completedDate: todayISO }]
            : without,
        };
      });
      return { prev };
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(habitsKey, ctx.prev);
    },
    // DELETE-path toggles don't echo over realtime (replica identity), so
    // always self-invalidate.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.habitsAll }),
  });

  return useMemo(() => {
    const data = query.data;
    const habits = data?.habits ?? [];
    const doneByHabit = new Map<string, Set<string>>();
    for (const c of data?.completions ?? []) {
      let set = doneByHabit.get(c.habitId);
      if (!set) {
        set = new Set();
        doneByHabit.set(c.habitId, set);
      }
      set.add(c.completedDate);
    }

    const empty: ReadonlySet<string> = new Set();
    const rows: HabitDayRow[] = habits
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((habit) => {
        const done = doneByHabit.get(habit.id) ?? empty;
        return {
          habit,
          scheduledToday: habit.daysOfWeek[dayOfWeekISO(todayISO)] === true,
          doneToday: done.has(todayISO),
          streak: computeStreak(habit, done, todayISO, windowStart),
        };
      });

    const today = rows.filter((r) => r.scheduledToday);
    return {
      rows,
      today,
      doneCount: today.filter((r) => r.doneToday).length,
      scheduledCount: today.length,
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: () => void query.refetch(),
      toggle: (habitId: string) => {
        const row = rows.find((r) => r.habit.id === habitId);
        toggleMutation.mutate({ habitId, completed: !(row?.doneToday ?? false) });
      },
      togglePending: toggleMutation.isPending,
    };
  }, [query.data, query.isLoading, query.isError, todayISO, windowStart]);
}

export function useHabitMutations() {
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.habitsAll });

  const create = useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string | null;
      icon?: string | null;
      daysOfWeek?: boolean[];
    }) => {
      const id = await createHabit(input);
      if (!id) throw new Error("create habit failed");
      return id;
    },
    onSettled: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      description?: string | null;
      icon?: string | null;
      daysOfWeek?: boolean[];
      archived?: boolean;
    }) => {
      const ok = await updateHabit(input);
      if (!ok) throw new Error("update habit failed");
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const ok = await deleteHabit(id);
      if (!ok) throw new Error("delete habit failed");
    },
    onSettled: invalidate,
  });

  return { create, update, remove };
}
