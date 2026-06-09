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
function RingProgress({ done, total }: { done: number; total: number }) {
  const size = 36;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total === 0 ? 0 : done / total;
  const dash = c * ratio;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--edge)"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--hud-cyan)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - dash }}
          transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          style={{
            filter:
              ratio > 0
                ? "drop-shadow(0 0 4px color-mix(in oklch, var(--hud-cyan) 50%, transparent))"
                : undefined,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink)]">
          {done}/{total}
        </span>
      </div>
    </div>
  );
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

  return (
    <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full transition-[border-color,transform] duration-150 ease-out hover:border-[var(--edge-hud)] hover:-translate-y-px">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <RingProgress done={doneCount} total={habits.length} />
          <h3 className="font-serif text-base font-semibold text-[var(--ink)] truncate">
            Today
          </h3>
        </div>
        <Link
          href="/habits"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          All →
        </Link>
      </header>
      {habits.length === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
          No habits yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 flex-1">
          {habits.slice(0, 6).map((h) => {
            const done = isDone(h.id);
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => handleToggle(h.id)}
                  className="flex w-full items-center gap-2.5 text-left cursor-pointer-always group/habit"
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
          {habits.length > 6 && (
            <li className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] pl-[22px]">
              +{habits.length - 6} more
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
