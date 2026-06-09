"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
  toggleHabitCompletion,
  type HabitWithAreas,
} from "@/app/actions/habits";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";

interface Props {
  userId: string;
  initialHabits: HabitWithAreas[];
  initialCompletions: Array<{ habitId: string; completedDate: string }>;
  todayISO: string;
}

/**
 * TodayHabitsWidget — at-a-glance + interactive tile for the LifeOS homepage.
 *
 * Quick task 260607-gox: converted from Server Component to client island.
 * Reuses tableKey("habits", userId) + the windowed habit_completions key
 * verbatim from HabitsClient so Realtime invalidation drives both surfaces.
 * Single-day window ([todayISO, todayISO]) for the widget; the /habits page
 * uses a rolling 14-day window. They share the same key prefix, so Realtime
 * subscriptions on `habit_completions` fan out to both.
 *
 * Notion-style checkbox: 14px Circle/Check icon button with cyan check on
 * done (one of the sanctioned cyan touches on /lifeos). Optimistic toggle via
 * a local Map<habitId, boolean> override — simpler than wiring useOptimistic
 * for a single date.
 */
export function TodayHabitsWidget({
  userId,
  initialHabits,
  initialCompletions,
  todayISO,
}: Props) {
  const queryClient = useQueryClient();
  const completionsKey = [
    ...tableKey("habit_completions", userId),
    todayISO,
    todayISO,
  ] as const;

  useTableSubscription("habits", userId);
  useTableSubscription("habit_completions", userId);

  const { data: habits = initialHabits } = useQuery({
    queryKey: tableKey("habits", userId),
    queryFn: getHabitsForCurrentUser,
    initialData: initialHabits,
  });

  const { data: completions = initialCompletions } = useQuery({
    queryKey: completionsKey,
    queryFn: () => getHabitCompletionsInRange(todayISO, todayISO),
    initialData: initialCompletions,
  });

  const [optimisticToggles, setOptimisticToggles] = useState<
    Map<string, boolean>
  >(new Map());

  const isDone = (habitId: string): boolean => {
    if (optimisticToggles.has(habitId)) return optimisticToggles.get(habitId)!;
    return completions.some(
      (c) => c.habitId === habitId && c.completedDate === todayISO,
    );
  };

  async function handleToggle(habitId: string) {
    const currentlyDone = isDone(habitId);
    const nextDone = !currentlyDone;

    setOptimisticToggles((prev) => new Map(prev).set(habitId, nextDone));

    const r = await toggleHabitCompletion({
      habitId,
      completedDate: todayISO,
      completed: nextDone,
    });

    if (!r.success) {
      setOptimisticToggles((prev) => {
        const next = new Map(prev);
        next.delete(habitId);
        return next;
      });
      toast.error(r.error);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: completionsKey });
    setOptimisticToggles((prev) => {
      const next = new Map(prev);
      next.delete(habitId);
      return next;
    });
  }

  return (
    <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full transition-[border-color,transform] duration-150 ease-out hover:border-[var(--edge-hud)] hover:-translate-y-px">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
          Today's habits
        </h3>
        <Link
          href="/habits"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          All →
        </Link>
      </header>
      {habits.length === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
          No habits yet. Set one up over on /habits.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 flex-1">
          {habits.map((h) => {
            const done = isDone(h.id);
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => handleToggle(h.id)}
                  className="flex w-full items-center gap-2.5 text-left cursor-pointer-always group/habit"
                >
                  {done ? (
                    <Check
                      size={14}
                      strokeWidth={2}
                      className="text-[var(--hud-cyan)] shrink-0"
                    />
                  ) : (
                    <Circle
                      size={14}
                      strokeWidth={1.5}
                      className="text-[var(--ink-muted)] shrink-0 group-hover/habit:text-[var(--ink)] transition-colors duration-100"
                    />
                  )}
                  <span
                    className={`font-serif text-[14px] ${
                      done
                        ? "text-[var(--ink-muted)] line-through"
                        : "text-[var(--ink)]"
                    }`}
                  >
                    {h.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
