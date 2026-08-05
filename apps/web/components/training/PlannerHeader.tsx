"use client";

import { format } from "date-fns";
import { BarChart3, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TrainingIcon } from "@/components/ui/icons";
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
    <div className="flex flex-col gap-3 px-1 pb-4">
      {/* Title row — dimensional icon + mono eyebrow (§7/§8). */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrainingIcon size={28} />
          <div className="flex flex-col gap-0.5">
            <span className="text-micro text-[var(--sd-ink-faint)]">
              Week planner
            </span>
            <h1 className="text-title font-semibold leading-none tracking-[-0.01em] text-[var(--sd-ink)]">
              Training
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-micro"
          >
            <Link href="/training/stats" aria-label="Open training stats">
              <BarChart3 size={13} strokeWidth={1.5} />
              Stats
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-micro"
            onClick={onManageTypesClick}
          >
            <Settings size={13} strokeWidth={1.5} />
            Manage types
          </Button>
        </div>
      </div>

      {/* Control row — week nav + range on the left, adherence pill right. */}
      <div className="flex items-center justify-between gap-4">
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
                "h-7 px-2 text-micro",
                isCurrentWeek && "text-[var(--sd-ink-faint)]",
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
          <span className="text-sm font-medium tabular-nums text-[var(--sd-ink)]">
            {startLabel} – {endLabel}
          </span>
        </div>

        {/* Craft chip: a pastel plate with a saturated rim. Once adherence
            clears 80% it lights up in the training hue (mint); below that it
            stays a neutral raised chip rather than shouting. */}
        <span
          className={cn(
            "tint-mint inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-micro tabular-nums",
            "shadow-[var(--shadow-card)] transition-[background-color,border-color,color] duration-[160ms] ease-out",
            adherencePct !== null && adherencePct >= 80
              ? "border-[var(--tint-edge)] bg-[var(--tint-bg)] font-medium text-[var(--tint-ink)]"
              : "border-[var(--edge)] bg-[var(--surface-raised)] text-[var(--sd-ink-dull)]",
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
      </div>
    </div>
  );
}
