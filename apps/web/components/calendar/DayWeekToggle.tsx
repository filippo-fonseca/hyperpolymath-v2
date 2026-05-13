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

export function DayWeekToggle({ view, onChange, date, onDateChange }: Props) {
  const step = view === "day" ? 1 : 7;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
        <button
          type="button"
          onClick={() => onChange("day")}
          className={cn(
            "px-2 py-1 text-xs rounded-sm font-sans",
            view === "day"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={view === "day"}
        >
          Day
        </button>
        <button
          type="button"
          onClick={() => onChange("week")}
          className={cn(
            "px-2 py-1 text-xs rounded-sm font-sans",
            view === "week"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
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
          <ChevronLeft size={14} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs font-sans"
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
          <ChevronRight size={14} />
        </Button>
      </div>

      <span className="font-serif text-sm text-muted-foreground ml-2">
        {view === "day"
          ? format(date, "EEEE, MMMM d, yyyy")
          : format(date, "MMMM yyyy")}
      </span>
    </div>
  );
}
