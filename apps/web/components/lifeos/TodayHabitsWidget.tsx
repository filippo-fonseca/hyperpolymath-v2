"use client";

import {
  type HabitCompletionRow,
  type HabitWithAreas,
  getHabitsForCurrentUser,
} from "@/app/actions/habits";
import { HabitStatusRingVisual } from "@/components/habits/HabitStatusRing";
import { useHabitDay } from "@/components/habits/use-habit-data";
import { EmptyState } from "@/components/ui/EmptyState";
import { HabitIcon } from "@/components/ui/icons";
import { HABIT_STATUS_LABEL, habitStatusActionLabel } from "@/lib/habits/status";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { WidgetBody, WidgetFooter } from "./WidgetCard";
import { ActionLink, EntityCardHeader, ProgressRow } from "./entity-card";

interface Props {
  userId: string;
  initialHabits: HabitWithAreas[];
  initialCompletions: HabitCompletionRow[];
  todayISO: string;
}

export function TodayHabitsWidget({ userId, initialHabits, initialCompletions, todayISO }: Props) {
  useTableSubscription("habits", userId);
  useTableSubscription("habit_completions", userId);

  const { data: habits = initialHabits } = useQuery({
    queryKey: tableKey("habits", userId),
    queryFn: getHabitsForCurrentUser,
    initialData: initialHabits,
  });

  // The tile no longer owns its own toggle. It reads the SAME per-day hook the
  // /habits page and the dock widget use, so the progress ladder, the
  // optimistic overlay, and the invalidation budget are shared rather than
  // re-implemented here (the old local `optimisticToggles` map was a third
  // copy of check-off logic that only understood done/not-done).
  const { statusOf, advance } = useHabitDay(userId, todayISO, todayISO, initialCompletions);

  const doneCount = habits.filter((h) => statusOf(h.id) === "done").length;
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
                const status = statusOf(h.id);
                const done = status === "done";
                const partial = status === "in_progress" || status === "almost_done";
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => advance(h.id)}
                      aria-label={habitStatusActionLabel(h.name, status)}
                      title={habitStatusActionLabel(h.name, status)}
                      className={cn(
                        "group/habit flex w-full cursor-pointer-always items-center gap-2 rounded-[8px] px-1.5 py-1 text-left transition-colors duration-[160ms] hover:bg-[var(--sd-hover)]",
                        tintFor(h.id)
                      )}
                    >
                      <HabitStatusRingVisual status={status} size="sm" />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-meta",
                          done ? "text-[var(--sd-ink-faint)] line-through" : "text-[var(--sd-ink)]"
                        )}
                      >
                        {h.name}
                        {partial ? (
                          <span className="ml-1.5 text-micro text-[var(--sd-ink-faint)]">
                            {HABIT_STATUS_LABEL[status]}
                          </span>
                        ) : null}
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
