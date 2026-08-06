"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { HabitIcon } from "@/components/ui/icons";
import { ActionLink, EntityCardHeader, ProgressRow } from "./entity-card";
import { WidgetBody, WidgetFooter } from "./WidgetCard";

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

  return (
    <>
      <WidgetBody>
        <EntityCardHeader
          icon={<HabitIcon size={20} />}
          title="Habits"
          subtitle="Today"
          // aug-05 quiet pass: no pill — the ProgressRow right below already
          // says "Completed 2/3"; repeating it in the header is noise.
          action={
            <Link href="/habits" className="group/action cursor-pointer-always">
              <ActionLink>All →</ActionLink>
            </Link>
          }
        />
        {total === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <EmptyState size="inline" title="No habits yet." />
          </div>
        ) : (
          <>
            <div className="mt-3">
              <ProgressRow
                label="Completed"
                value={`${doneCount}/${total}`}
                ratio={doneCount / total}
              />
            </div>
            <ul className="sd-scroll-hover -mr-2 mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-2">
              {habits.slice(0, 6).map((h) => {
                const done = isDone(h.id);
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => handleToggle(h.id)}
                      className="group/habit flex w-full cursor-pointer-always items-center gap-2 rounded-[8px] px-1.5 py-1 text-left transition-colors duration-[160ms] hover:bg-[var(--sd-hover)]"
                    >
                      <motion.span
                        initial={false}
                        animate={
                          reduced ? undefined : done ? { scale: [1, 1.18, 1] } : { scale: 1 }
                        }
                        transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                        className="inline-flex shrink-0"
                      >
                        {done ? (
                          <Check
                            size={13}
                            strokeWidth={2}
                            className="text-[var(--sd-accent)]"
                          />
                        ) : (
                          <Circle
                            size={13}
                            strokeWidth={1.5}
                            className="text-[var(--sd-ink-faint)] transition-colors duration-[160ms] group-hover/habit:text-[var(--sd-ink)]"
                          />
                        )}
                      </motion.span>
                      <span
                        className={`truncate text-meta ${
                          done
                            ? "text-[var(--sd-ink-faint)] line-through"
                            : "text-[var(--sd-ink)]"
                        }`}
                      >
                        {h.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </WidgetBody>

      {/* Footer — one faint line. The done count lives in the ProgressRow, so
          this only carries the roster size (and overflow when rows clip). */}
      {total > 0 && (
        <WidgetFooter>
          <span className="truncate text-micro tabular-nums text-[var(--sd-ink-faint)]">
            {total === 1 ? "1 habit" : `${total} habits`}
            {total > 6 && ` · +${total - 6} more`}
          </span>
        </WidgetFooter>
      )}
    </>
  );
}
