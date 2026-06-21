"use client";

import { addDays, format, isToday, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  date: string;
  onChange: (date: string) => void;
}

function formatDateLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  const yesterday = subDays(new Date(), 1);
  if (format(d, "yyyy-MM-dd") === format(yesterday, "yyyy-MM-dd")) {
    return "Yesterday";
  }
  return format(d, "EEE, MMM d");
}

/**
 * DayNavigator for journaling — left / right arrow day nav.
 *
 * Cloned from nutrition/DayNavigator with nutrition-specific affordances
 * removed ("Copy yesterday" button omitted). Future dates are disallowed
 * so the right chevron is disabled when the selected date is today.
 *
 * UI-SPEC:
 *   - ChevronLeft / ChevronRight in glass-button rounded-full 32px circles
 *   - Center: date label in serif 16px ("Today", "Yesterday", "Mon, Jun 10")
 */
export function DayNavigator({ date, onChange }: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const isAtToday = date >= today;

  const prev = format(addDays(parseISO(date), -1), "yyyy-MM-dd");
  const next = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
  const label = formatDateLabel(date);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => onChange(prev)}
        className="glass-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
      </button>

      <span
        className="font-serif text-[16px] text-[var(--ink)] min-w-[130px] text-center"
        aria-live="polite"
        aria-atomic="true"
      >
        {label}
      </span>

      <button
        type="button"
        aria-label="Next day"
        onClick={() => onChange(next)}
        disabled={isAtToday}
        className="glass-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[var(--ink-muted)]"
      >
        <ChevronRight size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
