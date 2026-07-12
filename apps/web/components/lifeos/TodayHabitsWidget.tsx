"use client";

import {
  type HabitWithAreas,
  getHabitCompletionsInRange,
  getHabitsForCurrentUser,
  toggleHabitCompletion,
} from "@/app/actions/habits";
import { DenseListRow, EmptyState, SectionHeader } from "@/components/spacedrive";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  userId: string;
  initialHabits: HabitWithAreas[];
  initialCompletions: Array<{ habitId: string; completedDate: string }>;
  todayISO: string;
}

/**
 * Ring progress in the header — a quiet visualization of "how much of today
 * have I claimed". Stroke is a thin ring (~3px) using --hud-cyan; track is
 * --edge. Numbers in the centre stay font-mono so they don't compete with
 * the serif habit rows.
 */
function RingProgress({ done, total, reduced }: { done: number; total: number; reduced: boolean }) {
  const size = 36;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total === 0 ? 0 : done / total;
  const dash = c * ratio;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg aria-hidden="true" width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--edge)"
          strokeWidth={stroke}
          fill="none"
        />
        {reduced ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="var(--deck-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c - dash}
          />
        ) : (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="var(--deck-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - dash }}
            transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink)]">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

export function TodayHabitsWidget({ userId, initialHabits, initialCompletions, todayISO }: Props) {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const completionsKey = [...tableKey("habit_completions", userId), todayISO, todayISO] as const;

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

  const [optimisticToggles, setOptimisticToggles] = useState<Map<string, boolean>>(new Map());

  const isDone = (habitId: string): boolean => {
    if (optimisticToggles.has(habitId)) return optimisticToggles.get(habitId) ?? false;
    return completions.some((c) => c.habitId === habitId && c.completedDate === todayISO);
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

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <RingProgress done={doneCount} total={habits.length} reduced={reduced ?? false} />
          <SectionHeader title="Habits today" />
        </div>
        <Link
          href="/habits"
          className="rounded-sm px-1 py-0.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--deck-ink-dull)] transition-colors [transition-duration:var(--dur-hover)] hover:text-[var(--deck-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          All →
        </Link>
      </div>
      {habits.length === 0 ? (
        <EmptyState
          title="No habits yet."
          description="Create a rhythm and it will appear here."
          className="min-h-0 flex-1 items-start px-0 py-8 text-left"
        />
      ) : (
        <ul className="flex flex-col gap-2 flex-1">
          {habits.slice(0, 6).map((h) => {
            const done = isDone(h.id);
            return (
              <li key={h.id}>
                <DenseListRow
                  title={h.name}
                  onActivate={() => handleToggle(h.id)}
                  className="h-10 px-2"
                  glyph={
                    <motion.span
                      initial={false}
                      animate={reduced ? undefined : done ? { scale: [1, 1.18, 1] } : { scale: 1 }}
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
                  }
                  selected={done}
                />
              </li>
            );
          })}
          {habits.length > 6 && (
            <li className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] pl-[22px]">
              +{habits.length - 6} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
