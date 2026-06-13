"use client";

import { addDays, format, isToday, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  date: string;
  onChange: (date: string) => void;
  onCopyYesterday: () => void;
  showCopyYesterday: boolean;
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
 * DayNavigator — left / right arrow day nav with "Copy yesterday" affordance.
 *
 * UI-SPEC §"Day Navigator":
 *   - ChevronLeft / ChevronRight in glass-button rounded-full 32px circles
 *   - Center: date label in serif 16px ("Today", "Yesterday", "Mon, Jun 10")
 *   - "Copy yesterday" mono 10.5px ink-muted — visible ONLY when showCopyYesterday is true
 */
export function DayNavigator({
  date,
  onChange,
  onCopyYesterday,
  showCopyYesterday,
}: Props) {
  const prev = format(addDays(parseISO(date), -1), "yyyy-MM-dd");
  const next = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
  const label = formatDateLabel(date);

  return (
    <div className="flex items-center justify-between gap-3">
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
          className="font-serif text-[16px] text-[var(--ink)] min-w-[120px] text-center"
          aria-live="polite"
          aria-atomic="true"
        >
          {label}
        </span>

        <button
          type="button"
          aria-label="Next day"
          onClick={() => onChange(next)}
          className="glass-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150"
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>

      {showCopyYesterday && (
        <button
          type="button"
          onClick={onCopyYesterday}
          className="font-mono text-[10.5px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-doc)] rounded"
        >
          Copy yesterday
        </button>
      )}
    </div>
  );
}
