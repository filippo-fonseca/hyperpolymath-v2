"use client";

import { cn } from "@/lib/utils";
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
 * Craft grammar (jul-29 restyle): the whole control is one raised white plate
 * on the card idiom — two chevron buttons flanking a sentence-case date label,
 * hairline-separated inside a single rounded shell rather than three floating
 * boxes. Hover deepens the shadow; the chevrons only warm their own cell.
 */
export function DayNavigator({ date, onChange }: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const isAtToday = date >= today;

  const prev = format(addDays(parseISO(date), -1), "yyyy-MM-dd");
  const next = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
  const label = formatDateLabel(date);

  const iconBtn =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] " +
    "cursor-pointer-always transition-colors duration-[160ms] ease-out motion-reduce:transition-none " +
    "hover:bg-[var(--hover)] hover:text-[var(--ink)] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edge-strong)] " +
    "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--ink-muted)]";

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl border p-1",
        "border-[var(--edge)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out",
        "hover:border-[var(--edge-strong)] hover:shadow-[var(--shadow-card-hover)]",
        "motion-reduce:transition-none"
      )}
    >
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => onChange(prev)}
        className={iconBtn}
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
      </button>

      <span
        className="min-w-[112px] text-center text-meta font-medium text-[var(--ink)]"
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
