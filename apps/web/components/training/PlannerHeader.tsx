"use client";

import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WeekRange } from "@/lib/training/week";
import { cn } from "@/lib/utils";

interface Props {
  week: WeekRange;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onJumpToday: () => void;
  /** Count of activities marked done this week. */
  doneCount: number;
  /**
   * Denominator for adherence — total non-cancelled, non-skipped activities
   * planned for this week. Per TRN-12 / D-14.
   */
  plannedCount: number;
  onManageTypesClick: () => void;
  isCurrentWeek: boolean;
}

/**
 * Top-of-planner header. Renders prev/next week arrows, the formatted Mon–Sun
 * range, the planned-vs-actual adherence pill, and the "Manage types" button.
 *
 * Density is intentionally tighter than the Tasks kanban header (D-01 — the
 * Training surface is "smaller, less chrome").
 */
export function PlannerHeader({
  week,
  onPrevWeek,
  onNextWeek,
  onJumpToday,
  doneCount,
  plannedCount,
  onManageTypesClick,
  isCurrentWeek,
}: Props) {
  const sameMonth = week.start.getMonth() === week.end.getMonth();
  const sameYear = week.start.getFullYear() === week.end.getFullYear();
  const startLabel = format(
    week.start,
    sameMonth && sameYear ? "MMM d" : sameYear ? "MMM d" : "MMM d, yyyy",
  );
  const endLabel = format(week.end, sameYear ? "MMM d" : "MMM d, yyyy");

  const adherencePct =
    plannedCount === 0 ? null : Math.round((doneCount / plannedCount) * 100);

  return (
    <div className="flex items-center justify-between gap-4 px-1 pb-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onPrevWeek}
            aria-label="Previous week"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 font-mono text-[11px] uppercase tracking-[0.06em]",
              isCurrentWeek && "text-[var(--ink-muted)]",
            )}
            onClick={onJumpToday}
            disabled={isCurrentWeek}
            aria-label="Jump to current week"
          >
            This week
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onNextWeek}
            aria-label="Next week"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </Button>
        </div>
        <span className="font-serif text-sm text-[var(--ink)]">
          {startLabel} – {endLabel}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-full border border-[var(--edge)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]",
            adherencePct !== null && adherencePct >= 80 && "text-[var(--ink)]",
          )}
          title={
            adherencePct === null
              ? "Nothing planned this week"
              : `${doneCount} of ${plannedCount} planned activities done`
          }
        >
          {adherencePct === null
            ? "— %"
            : `${adherencePct}% · ${doneCount}/${plannedCount}`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.06em]"
          onClick={onManageTypesClick}
        >
          <Settings size={13} strokeWidth={1.5} />
          Manage types
        </Button>
      </div>
    </div>
  );
}
