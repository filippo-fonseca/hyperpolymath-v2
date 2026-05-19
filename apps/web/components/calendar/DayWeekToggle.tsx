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

interface Props {
  view: "day" | "week";
  onChange: (view: "day" | "week") => void;
  date: Date;
  onDateChange: (date: Date) => void;
}

// Phase 6.1 Plan 06.1-05 (UI-SPEC §5g + §9 chip register):
// Segmented control + nav buttons render diplomatic chrome. Mono uppercase
// register on the day/week segment + Today button (calendar metadata
// register); the date label keeps serif because it's content (the page is
// reading a date, not labeling chrome). Inactive segments at --ink-muted
// dim to --ink on 100ms hover; active state gets 1px inset --edge ring.
export function DayWeekToggle({ view, onChange, date, onDateChange }: Props) {
  const step = view === "day" ? 1 : 7;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5 border border-[var(--edge)] rounded-sm p-0.5 bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => onChange("day")}
          className={cn(
            "px-2 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
            "transition-colors duration-150 ease-out",
            view === "day"
              ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--edge)]"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
          )}
          aria-pressed={view === "day"}
        >
          Day
        </button>
        <button
          type="button"
          onClick={() => onChange("week")}
          className={cn(
            "px-2 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
            "transition-colors duration-150 ease-out",
            view === "week"
              ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--edge)]"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
          )}
          aria-pressed={view === "week"}
        >
          Week
        </button>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => onDateChange(addDays(date, -step))}
          aria-label={view === "day" ? "Previous day" : "Previous week"}
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
          aria-label={view === "day" ? "Next day" : "Next week"}
        >
          <ChevronRight size={14} strokeWidth={1.5} />
        </Button>
      </div>

      {/* Date label remains serif (content register) — see UI-SPEC §5g */}
      <span className="font-serif text-sm text-[var(--ink-muted)] ml-2">
        {view === "day"
          ? format(date, "EEEE, MMMM d, yyyy")
          : format(date, "MMMM yyyy")}
      </span>
    </div>
  );
}
