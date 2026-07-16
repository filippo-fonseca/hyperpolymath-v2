"use client";

/**
 * `DayWeekToggle` — small view-toggle + date-navigator above the grid.
 *
 * Phase 4 Plan 04-03.
 *
 * Why a hand-rolled toggle (vs RBC's built-in toolbar):
 *   - The RBC toolbar is functional but doesn't match our existing
 *     /tasks view-toggle styling. Keeping the same button rhythm across
 *     surfaces preserves muscle memory.
 *   - The "Today" button is its own affordance — easier to reach than the
 *     date navigator arrows on a long week.
 *
 * Keyboard support: native <button> elements; Tab + Enter work.
 */

import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarView = "day" | "3day" | "week";

interface Props {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
  date: Date;
  onDateChange: (date: Date) => void;
}

// sd3 register: segmented control + nav buttons render diplomatic chrome on
// the --sd-* surface family. Mono uppercase on the day/week segment + Today
// button; the date label is mono metadata too (sd3 seed drops serif — single
// Space Grotesk / mono register). Inactive segments at --sd-ink-dull dim to
// --sd-ink on hover; the active segment gets a 1px inset --sd-line ring.
const SEGMENTS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "3day", label: "3 Day" },
  { value: "week", label: "Week" },
];

export function DayWeekToggle({ view, onChange, date, onDateChange }: Props) {
  const step = view === "day" ? 1 : view === "3day" ? 3 : 7;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5 border border-[var(--sd-line)] rounded-[6px] p-0.5 bg-[var(--sd-input)]">
        {SEGMENTS.map((seg) => (
          <button
            key={seg.value}
            type="button"
            onClick={() => onChange(seg.value)}
            className={cn(
              "px-2 py-0.5 rounded-[5px] font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
              "transition-colors duration-150 ease-out",
              view === seg.value
                ? "bg-[var(--sd-selected)] text-[var(--sd-ink)] ring-1 ring-inset ring-[var(--sd-line)]"
                : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]",
            )}
            aria-pressed={view === seg.value}
          >
            {seg.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => onDateChange(addDays(date, -step))}
          aria-label={view === "day" ? "Previous day" : view === "3day" ? "Previous 3 days" : "Previous week"}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 font-mono text-[11px] uppercase tracking-[0.06em]"
          onClick={() => onDateChange(new Date())}
        >
          Today
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => onDateChange(addDays(date, step))}
          aria-label={view === "day" ? "Next day" : view === "3day" ? "Next 3 days" : "Next week"}
        >
          <ChevronRight size={14} strokeWidth={1.5} />
        </Button>
      </div>

      {/* Date label — mono metadata register (sd3 seed: mono date labels). */}
      <span className="font-mono text-[12px] tabular-nums tracking-[0.02em] text-[var(--sd-ink-dull)] ml-2">
        {view === "day"
          ? format(date, "EEEE, MMMM d, yyyy")
          : view === "3day"
            ? `${format(date, "MMM d")} – ${format(addDays(date, 2), "MMM d, yyyy")}`
            : format(date, "MMMM yyyy")}
      </span>
    </div>
  );
}
