"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, Repeat } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
import { EntityCardHeader, ProgressRow, StatusPill } from "./entity-card";

interface Props {
  userId: string;
  initialHabits: HabitWithAreas[];
  initialCompletions: Array<{ habitId: string; completedDate: string }>;
  todayISO: string;
}

export function TodayHabitsWidget({
  userId,
  initialHabits,
  initialCompletions,
  todayISO,
}: Props) {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
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

  const doneCount = habits.filter((h) => isDone(h.id)).length;
  const total = habits.length;

  const pill =
    total === 0 ? (
      <StatusPill tone="idle" label="empty" />
    ) : doneCount === total ? (
      <StatusPill tone="active" label="all done" />
    ) : doneCount > 0 ? (
      <StatusPill tone="progress" label={`${doneCount} done`} />
    ) : (
      <StatusPill tone="idle" label="none yet" />
    );

  return (
    <div className="flex flex-col h-full">
      <EntityCardHeader
        icon={<Repeat size={15} strokeWidth={1.75} className="text-[var(--ink-muted)]" />}
        title="Habits"
        subtitle="Today"
        pill={pill}
        action={
          <Link
            href="/habits"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
          >
            All →
          </Link>
        }
      />
      {total === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
          No habits yet.
        </p>
      ) : (
        <>
          <div className="mb-4">
            <ProgressRow
              label="Completed"
              value={`${doneCount}/${total}`}
              ratio={doneCount / total}
            />
          </div>
          <ul className="flex flex-col gap-1 flex-1">
            {habits.slice(0, 6).map((h) => {
              const done = isDone(h.id);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => handleToggle(h.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left cursor-pointer-always group/habit transition-colors duration-100 ${
                      done
                        ? "bg-[color-mix(in_oklch,var(--ink)_4%,transparent)]"
                        : "hover:bg-[color-mix(in_oklch,var(--ink)_3%,transparent)]"
                    }`}
                  >
                    <motion.span
                      initial={false}
                      animate={
                        reduced
                          ? undefined
                          : done
                            ? { scale: [1, 1.18, 1] }
                            : { scale: 1 }
                      }
                      transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                      className="inline-flex shrink-0"
                    >
                      {done ? (
                        <Check
                          size={14}
                          strokeWidth={2}
                          className="text-[var(--hud-cyan)]"
                          style={{
                            filter:
                              "drop-shadow(0 0 5px color-mix(in oklch, var(--hud-cyan) 55%, transparent))",
                          }}
                        />
                      ) : (
                        <Circle
                          size={14}
                          strokeWidth={1.5}
                          className="text-[var(--ink-muted)] group-hover/habit:text-[var(--ink)] transition-colors duration-100"
                        />
                      )}
                    </motion.span>
                    <span
                      className={`font-serif text-[14px] truncate ${
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
            {total > 6 && (
              <li className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] pl-[30px] pt-0.5">
                +{total - 6} more
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
