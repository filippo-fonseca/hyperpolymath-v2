"use client";

import { useRef } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fromYmd, toYmd } from "@/lib/tasks/date-shortcuts";

interface Props {
  /** Active day in YYYY-MM-DD form (URL-synced via TasksClient). */
  dateYmd: string;
  onDateChange: (ymd: string) => void;
}

/**
 * Date navigator above the kanban day view. Arrows step ±1 day, Today
 * snaps back, and the date label opens a native picker. (The Inbox is now a
 * persistent column — no toggle lives here; Plan 04 lifts the day-nav into a
 * universal DaySwitcher.)
 */
export function KanbanDayHeader({ dateYmd, onDateChange }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const date = fromYmd(dateYmd);
  const today = new Date();
  const isToday = isSameDay(date, today);

  return (
    <div className="flex items-center justify-between gap-4 px-1 pb-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onDateChange(toYmd(addDays(date, -1)))}
            aria-label="Previous day"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 font-mono text-[11px] uppercase tracking-[0.06em]",
              isToday && "text-[var(--ink-muted)]",
            )}
            onClick={() => onDateChange(toYmd(today))}
            disabled={isToday}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onDateChange(toYmd(addDays(date, 1)))}
            aria-label="Next day"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </Button>
        </div>

        {/* Date label as the calendar trigger. Clicking opens the native
            picker (showPicker on browsers that support it; focus + click
            fallback otherwise). */}
        <button
          type="button"
          className="relative font-serif text-base text-[var(--ink)] hover:text-[var(--ink)] cursor-pointer-always"
          onClick={() => pickerRef.current?.showPicker?.() ?? pickerRef.current?.focus()}
          title="Jump to a date"
        >
          {format(date, "EEEE, MMMM d, yyyy")}
          {isToday ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              · Today
            </span>
          ) : null}
          <input
            ref={pickerRef}
            type="date"
            value={dateYmd}
            onChange={(e) => {
              if (e.target.value) onDateChange(e.target.value);
            }}
            // The native input is invisible — the visible button is the
            // real affordance; we position 0×0 so the picker anchors near
            // the label.
            className="absolute left-0 top-full h-0 w-0 opacity-0"
            aria-hidden
            tabIndex={-1}
          />
        </button>
      </div>
    </div>
  );
}
