"use client";

import { HabitStatusRingVisual } from "@/components/habits/HabitStatusRing";
import {
  HABIT_PARTIAL_STATUSES,
  HABIT_STATUS_LABEL,
  HABIT_STATUS_SHORT_LABEL,
  type HabitStatus,
} from "@/lib/habits/status";
import { cn } from "@/lib/utils";

/**
 * "Started" and "Almost done", one click away, in the row itself.
 *
 * The partial rungs used to cost three interactions everywhere they appeared:
 * hover the row, open the overflow menu, pick the item (on /habits), or walk
 * the whole ladder one tap at a time (in the dock). Both are the wrong price
 * for something you do mid-morning on the way past. These are two real buttons
 * sitting in the row, always present, quiet at rest.
 *
 * Each chip is a TOGGLE, not a setter: clicking the rung you are already on
 * clears the day back to not-started. That is what replaces the menu's
 * explicit "Not started" item without adding a third chip nobody wants to
 * aim at.
 *
 * The check disc stays where it is and keeps owning done/undone. These chips
 * only ever move a habit between the two middle rungs and zero.
 */
export function HabitQuickStatus({
  habitName,
  status,
  disabled,
  onSetStatus,
  showLabels = true,
  className,
}: {
  habitName: string;
  status: HabitStatus;
  disabled?: boolean;
  onSetStatus: (next: HabitStatus) => void;
  /** Roomy surfaces name the rungs; the dock is too tight, so it goes icon-only. */
  showLabels?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex shrink-0 items-center gap-0.5", className)}>
      {HABIT_PARTIAL_STATUSES.map((rung) => {
        const active = status === rung;
        return (
          <button
            key={rung}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={
              active
                ? `Clear “${habitName}” back to not started`
                : `Mark “${habitName}” ${HABIT_STATUS_LABEL[rung].toLowerCase()}`
            }
            title={active ? "Clear progress" : HABIT_STATUS_LABEL[rung]}
            onClick={(e) => {
              // Dock rows nest these inside a whole-row tap target; without
              // this the chip would also advance the ladder underneath it.
              e.stopPropagation();
              onSetStatus(active ? "not_started" : rung);
            }}
            className={cn(
              "inline-flex cursor-pointer-always items-center gap-1 rounded-sm px-1 py-0.5",
              "text-micro font-medium leading-none",
              "transition-colors duration-[160ms] ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              active
                ? "bg-[var(--tint-bg)] text-[var(--tint-ink,var(--ink))]"
                : "text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
              disabled && "cursor-not-allowed opacity-40"
            )}
          >
            <HabitStatusRingVisual status={rung} size="sm" />
            {showLabels ? HABIT_STATUS_SHORT_LABEL[rung] : null}
          </button>
        );
      })}
    </span>
  );
}
