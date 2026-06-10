"use client";

import { useDroppable } from "@dnd-kit/core";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import type {
  ActivityWithType,
  TypeWithBatch,
} from "@/lib/db/queries/training";
import type { DistanceUnit } from "@/lib/training/distance";
import { cn } from "@/lib/utils";
import { ActivityCard } from "./ActivityCard";

interface Props {
  dateISO: string;
  date: Date;
  isToday: boolean;
  activities: ActivityWithType[];
  types: TypeWithBatch[];
  distanceUnit: DistanceUnit;
  /** True while any card in the board is being dragged — used for drop highlight. */
  isAnyDragging: boolean;
  /** Opens the CompleteActivityDialog (15-04) for the clicked card. */
  onCheckOff?: (activity: ActivityWithType) => void;
  /** Opens the ActivityEditDialog (15-04) for the clicked card's kebab → Edit. */
  onEdit?: (activity: ActivityWithType) => void;
  /** Opens CreateActivityDialog seeded with this column's date. */
  onAddActivity?: (dateISO: string) => void;
}

/**
 * One day column on the Training board. Tight density per D-01 — text-xs,
 * minimal chrome, designed for week-at-a-glance scanning.
 */
export function TrainingDayColumn({
  dateISO,
  date,
  isToday,
  activities,
  types,
  distanceUnit,
  isAnyDragging,
  onCheckOff,
  onEdit,
  onAddActivity,
}: Props) {
  const { isOver, setNodeRef } = useDroppable({ id: dateISO });

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div
        className={cn(
          "flex items-baseline justify-between px-1 pb-1",
          isToday && "border-b border-[var(--hud-cyan,var(--ink))]",
        )}
      >
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.08em]",
            isToday ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
          )}
        >
          {format(date, "EEE")}
        </span>
        <span
          className={cn(
            "font-serif text-xs",
            isToday ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
          )}
        >
          {format(date, "d")}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[80px] flex-col gap-1.5 rounded-md p-1.5 transition-colors",
          isAnyDragging && "ring-1 ring-[var(--edge)]",
          isOver && "bg-[var(--surface)] ring-1 ring-[var(--ink)]",
        )}
      >
        {activities.map((a) => (
          <ActivityCard
            key={a.id}
            activity={a}
            distanceUnit={distanceUnit}
            onCheckOff={onCheckOff}
            onEdit={onEdit}
          />
        ))}

        <button
          type="button"
          onClick={() => onAddActivity?.(dateISO)}
          disabled={types.length === 0}
          className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={11} strokeWidth={1.5} />
          Add activity
        </button>
      </div>
    </div>
  );
}
