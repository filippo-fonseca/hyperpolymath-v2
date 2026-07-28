"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  calendarGridStart,
  parseISODate,
  toISODate,
  todayISO,
} from "./date-utils";

interface Props {
  /** Currently-selected day, ISO. */
  value: string;
  /** Called when the user picks a different day. */
  onChange: (iso: string) => void;
}

/**
 * Compact month calendar — Sun-first 6×7 grid, no external date library
 * involved. Highlights the selected day (amber pill) and today (mono dot
 * under the number when it isn't selected). Clicking a day commits and
 * closes via the consumer (this component doesn't own dismiss).
 */
export function MiniCalendar({ value, onChange }: Props) {
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => {
    const d = parseISODate(value);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const today = todayISO();

  const cells = useMemo(() => {
    const start = calendarGridStart(monthAnchor);
    const out: { iso: string; date: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({
        iso: toISODate(d),
        date: d.getDate(),
        inMonth: d.getMonth() === monthAnchor.getMonth(),
      });
    }
    return out;
  }, [monthAnchor]);

  function shiftMonth(delta: number) {
    setMonthAnchor(
      new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1),
    );
  }

  return (
    <div className="w-[252px] select-none">
      {/* Header — month label + nav arrows */}
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)] cursor-pointer-always"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-meta font-medium text-[var(--ink)]">
          {MONTH_NAMES[monthAnchor.getMonth()]} {monthAnchor.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)] cursor-pointer-always"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_SHORT.map((w, i) => (
          <span
            key={i}
            className="py-1 text-center text-micro text-[var(--ink-faint)]"
          >
            {w}
          </span>
        ))}
      </div>

      {/* Grid — borderless day cells on the popover surface (one border per
          nesting level; the popover already carries it). Selected day is the
          single accent-filled active-state indicator; today gets a dot. */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const isSelected = c.iso === value;
          const isToday = c.iso === today;
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onChange(c.iso)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "relative inline-flex h-8 items-center justify-center rounded-lg",
                "font-mono text-micro tabular-nums cursor-pointer-always",
                "transition-colors duration-[160ms] ease-out",
                isSelected
                  ? "font-medium text-[var(--canvas)]"
                  : c.inMonth
                    ? "text-[var(--ink)] hover:bg-[var(--hover)]"
                    : "text-[var(--ink-faint)] hover:bg-[var(--hover)]",
              )}
              style={
                isSelected ? { background: "var(--accent)" } : undefined
              }
            >
              {c.date}
              {isToday && !isSelected ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                  style={{ backgroundColor: "var(--accent)" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
