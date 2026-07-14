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
import { HabitIcon } from "@/components/ui/icons";
import {
  ActionLink,
  Chip,
  EmptyState,
  EntityCardHeader,
  OverflowChip,
  ProgressRow,
  StatusPill,
} from "./entity-card";
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
    <>
      <WidgetBody>
        <EntityCardHeader
          icon={<HabitIcon size={36} />}
          title="Habits"
          subtitle="Today"
          pill={pill}
          action={
            <Link href="/habits" className="group/action cursor-pointer-always">
              <ActionLink>All →</ActionLink>
            </Link>
          }
        />
        {total === 0 ? (
          <EmptyState icon={<HabitIcon size={40} />}>No habits yet.</EmptyState>
        ) : (
          <>
            <div className="mt-3.5">
              <ProgressRow
                label="Completed"
                value={`${doneCount}/${total}`}
                ratio={doneCount / total}
              />
            </div>
            <ul className="mt-3.5 flex flex-1 flex-col gap-0.5">
              {habits.slice(0, 6).map((h) => {
                const done = isDone(h.id);
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => handleToggle(h.id)}
                      className="group/habit flex w-full cursor-pointer-always items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors duration-100 hover:bg-[var(--sd-hover)]"
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
                            size={14}
                            strokeWidth={2}
                            className="text-[var(--sd-accent)]"
                          />
                        ) : (
                          <Circle
                            size={14}
                            strokeWidth={1.5}
                            className="text-[var(--sd-ink-faint)] transition-colors duration-100 group-hover/habit:text-[var(--sd-ink)]"
                          />
                        )}
                      </motion.span>
                      <span
                        className={`truncate text-[14px] ${
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

      <WidgetFooter>
        <Chip>{total === 1 ? "1 habit" : `${total} habits`}</Chip>
        {doneCount > 0 && <Chip tone="var(--ink-sage)">{doneCount} done</Chip>}
        {total > 6 && <OverflowChip count={total - 6} />}
      </WidgetFooter>
    </>
  );
}
