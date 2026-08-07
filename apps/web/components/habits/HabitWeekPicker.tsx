"use client";

import { addDaysISO, parseISODate } from "@/components/habits/date-utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { MiniCalendar } from "./MiniCalendar";

/**
 * The date navigator for the check-off surface: seven day pills you can hit
 * directly.
 *
 * It replaces a prev/next chevron pair plus a calendar popover, which made
 * "yesterday" — the only backfill anyone actually does — a two-step operation,
 * and gave no sense of where you were in the week. Every tracker surveyed uses
 * a visible week strip instead, because the useful range is small and bounded.
 *
 * The calendar stays, behind one button, for the rare jump further back.
 * Chevrons page the whole week rather than the day, since day-stepping is what
 * the pills are for.
 */

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function HabitWeekPicker({
  selectedDate,
  today,
  onSelectDate,
}: {
  selectedDate: string;
  today: string;
  onSelectDate: (iso: string) => void;
}) {
  const [calOpen, setCalOpen] = useState(false);

  // The week ENDS on today when you are at the present, so the default view is
  // the last seven days rather than a calendar week with empty future in it.
  // Paging shifts that window by seven.
  const [anchorEnd, setAnchorEnd] = useState(today);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(anchorEnd, i - 6));

  const atPresent = anchorEnd === today;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAnchorEnd(addDaysISO(anchorEnd, -7))}
        aria-label="Previous week"
        className="inline-flex size-7 shrink-0 cursor-pointer-always items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
      >
        <ChevronLeft size={14} />
      </button>

      <fieldset className="flex items-center gap-1 border-0 p-0" aria-label="Pick a day">
        {days.map((iso) => {
          const d = parseISODate(iso);
          const isSelected = iso === selectedDate;
          const isToday = iso === today;
          const isFuture = iso > today;
          return (
            <button
              key={iso}
              type="button"
              disabled={isFuture}
              onClick={() => onSelectDate(iso)}
              aria-pressed={isSelected}
              aria-label={d.toDateString()}
              className={cn(
                "flex w-9 shrink-0 cursor-pointer-always flex-col items-center gap-0.5 rounded-lg px-1 py-1.5",
                "transition-colors duration-[160ms] ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                isSelected
                  ? "bg-[var(--selected)] text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
                isFuture && "cursor-not-allowed opacity-30"
              )}
            >
              <span className="text-micro leading-none">{DOW[d.getDay()]}</span>
              <span
                className={cn(
                  "text-meta leading-none tabular-nums",
                  isSelected && "font-semibold",
                  // Today keeps a mark even when you have navigated away from
                  // it, so the strip never loses its anchor.
                  isToday && !isSelected && "text-[var(--accent)]"
                )}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </fieldset>

      <button
        type="button"
        onClick={() => setAnchorEnd(addDaysISO(anchorEnd, 7))}
        disabled={atPresent}
        aria-label="Next week"
        className={cn(
          "inline-flex size-7 shrink-0 cursor-pointer-always items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
          atPresent && "cursor-not-allowed opacity-30"
        )}
      >
        <ChevronRight size={14} />
      </button>

      {!atPresent || selectedDate !== today ? (
        <button
          type="button"
          onClick={() => {
            setAnchorEnd(today);
            onSelectDate(today);
          }}
          className="shrink-0 cursor-pointer-always rounded-lg px-2 py-1 text-micro text-[var(--ink-muted)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        >
          Today
        </button>
      ) : null}

      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Open calendar"
            className="inline-flex size-7 shrink-0 cursor-pointer-always items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <CalendarIcon size={13} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-2">
          <MiniCalendar
            value={selectedDate}
            onChange={(iso) => {
              onSelectDate(iso);
              setAnchorEnd(iso > today ? today : iso);
              setCalOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
