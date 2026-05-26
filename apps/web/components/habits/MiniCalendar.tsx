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
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="inline-flex w-6 h-6 items-center justify-center rounded-md text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors cursor-pointer-always"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="font-serif text-[14px] text-[var(--ink)]">
          {MONTH_NAMES[monthAnchor.getMonth()]} {monthAnchor.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="inline-flex w-6 h-6 items-center justify-center rounded-md text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors cursor-pointer-always"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAY_SHORT.map((w, i) => (
          <span
            key={i}
            className="text-center font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-muted)] py-1"
          >
            {w}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0.5">
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
                "relative inline-flex items-center justify-center h-8 rounded-md",
                "font-mono text-[12px] tabular-nums cursor-pointer-always",
                "transition-colors duration-100 ease-out",
                !c.inMonth && "text-[var(--ink-muted)]/40",
                c.inMonth && !isSelected && "text-[var(--ink)]",
                !isSelected &&
                  "hover:bg-[color-mix(in_oklch,var(--ink)_6%,transparent)]",
                isSelected &&
                  "bg-[var(--ink-amber)] text-[var(--canvas)] font-medium",
              )}
            >
              {c.date}
              {isToday && !isSelected ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: "var(--hud-cyan)" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
