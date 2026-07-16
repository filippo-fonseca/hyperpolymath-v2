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
 * DayNavigator for journaling — left / right arrow day nav in the sd register.
 *
 * Cloned from nutrition/DayNavigator with nutrition-specific affordances
 * removed ("Copy yesterday" button omitted). Future dates are disallowed
 * so the right chevron is disabled when the selected date is today.
 *
 * sd grammar:
 *   - ChevronLeft / ChevronRight as sd ghost icon-buttons (--sd-box plate,
 *     --sd-line hairline, --sd-hover on hover). No glass-button, no glow.
 *   - Center: mono uppercase date label ("TODAY", "YESTERDAY", "MON, JUN 10").
 */
export function DayNavigator({ date, onChange }: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const isAtToday = date >= today;

  const prev = format(addDays(parseISO(date), -1), "yyyy-MM-dd");
  const next = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
  const label = formatDateLabel(date);

  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-[8px] " +
    "border border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--sd-ink-dull)] " +
    "transition-colors duration-150 hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)] " +
    "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-[var(--sd-box)] disabled:hover:text-[var(--sd-ink-dull)]";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => onChange(prev)}
        className={iconBtn}
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
      </button>

      <span
        className="min-w-[132px] text-center font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--sd-ink)]"
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
        className={iconBtn}
      >
        <ChevronRight size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
