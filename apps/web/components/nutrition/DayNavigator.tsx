"use client";

import { addDays, format, isToday, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

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
 * DayNavigator — prev / label / next day nav in the sd ghost grammar shared
 * with journaling + habits: `Button variant="ghost"` icon steppers around a
 * semibold date label, with a "Copy yesterday" ghost verb when the day is empty.
 * No glass, no serif — sd tokens throughout.
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
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Previous day"
        onClick={() => onChange(prev)}
      >
        <ChevronLeft size={14} />
      </Button>
      <span
        className="min-w-[120px] px-1 text-center text-[15px] font-semibold leading-none tracking-[-0.01em] text-[var(--sd-ink)]"
        aria-live="polite"
        aria-atomic="true"
      >
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Next day"
        onClick={() => onChange(next)}
      >
        <ChevronRight size={14} />
      </Button>

      {showCopyYesterday && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopyYesterday}
          className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em]"
        >
          <CopyPlus size={13} /> Copy yesterday
        </Button>
      )}
    </div>
  );
}
