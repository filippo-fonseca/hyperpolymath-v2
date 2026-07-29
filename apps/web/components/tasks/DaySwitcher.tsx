"use client";

import { useRef } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fromYmd, toYmd } from "@/lib/tasks/date-shortcuts";

interface Props {
  /** Active day in YYYY-MM-DD form (URL-synced via TasksClient). */
  dateYmd: string;
  onDateChange: (ymd: string) => void;
}

/**
 * Universal day switcher. A single day control re-scopes kanban and list from
 * one shared `dateYmd`. Arrows step one day, "Today" snaps back (and is simply
 * absent while already on today; nothing on this surface renders disabled),
 * and the date label opens a native picker.
 */
export function DaySwitcher({ dateYmd, onDateChange }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const date = fromYmd(dateYmd);
  const today = new Date();
  const isToday = isSameDay(date, today);

  return (
    <div className="flex items-center gap-2 pb-4">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 rounded-lg p-0"
          onClick={() => onDateChange(toYmd(addDays(date, -1)))}
          aria-label="Previous day"
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
        </Button>
        {!isToday && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-lg px-2 text-micro font-medium"
            onClick={() => onDateChange(toYmd(today))}
          >
            Today
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 rounded-lg p-0"
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
        className="relative text-subtitle font-medium text-[var(--ink)] cursor-pointer-always"
        onClick={() => pickerRef.current?.showPicker?.() ?? pickerRef.current?.focus()}
        title="Jump to a date"
      >
        {format(date, "EEEE, MMMM d, yyyy")}
        {isToday ? (
          <span className="ml-2 text-micro font-medium text-[var(--ink-faint)]">Today</span>
        ) : null}
        <input
          ref={pickerRef}
          type="date"
          value={dateYmd}
          onChange={(e) => {
            if (e.target.value) onDateChange(e.target.value);
          }}
          className="absolute left-0 top-full h-0 w-0 opacity-0"
          aria-hidden
          tabIndex={-1}
        />
      </button>
    </div>
  );
}
