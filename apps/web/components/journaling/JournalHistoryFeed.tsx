"use client";

import { format, isToday, parseISO, subDays } from "date-fns";
import type { JournalEntry } from "@/app/actions/journal";
import { cn } from "@/lib/utils";

interface Props {
  entries: JournalEntry[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
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
 * JournalHistoryFeed — scrollable list of past journal entries.
 *
 * Each row is a glass tile showing:
 *   - Date label (Today / Yesterday / "Mon, Jun 10")
 *   - Truncated mainResponse preview (or "No entry yet" when empty)
 *
 * Clicking a row calls onSelectDate to navigate the editor to that date.
 * The active (selected) row gets a subtle cyan accent border.
 *
 * Empty state: single glass tile reading "No entries yet."
 *
 * Responsive: full-width on mobile, sidebar column on desktop
 * (layout is controlled by the parent JournalingClient grid).
 */
export function JournalHistoryFeed({ entries, selectedDate, onSelectDate }: Props) {
  if (entries.length === 0) {
    return (
      <aside aria-label="Journal history">
        <div className="glass-tile rounded-xl px-4 py-3 text-center">
          <p className="font-serif text-[14px] text-[var(--ink-muted)] italic">
            No entries yet.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Journal history">
      <div className="flex flex-col gap-2 max-h-[60vh] md:max-h-[calc(100vh-180px)] overflow-y-auto pr-0.5">
        {entries.map((entry) => {
          const isSelected = entry.date === selectedDate;
          const preview = entry.mainResponse?.trim();

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelectDate(entry.date)}
              className={cn(
                "glass-tile rounded-xl px-4 py-3 text-left w-full",
                "transition-[border-color,box-shadow] duration-150",
                isSelected &&
                  "[--glass-border:color-mix(in_oklch,var(--hud-cyan)_40%,transparent)] [--glass-glow:10%]",
              )}
              aria-current={isSelected ? "date" : undefined}
              aria-label={`Journal entry for ${formatDateLabel(entry.date)}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={cn(
                    "font-serif text-[13px] font-semibold",
                    isSelected ? "text-[var(--hud-cyan)]" : "text-[var(--ink)]",
                  )}
                >
                  {formatDateLabel(entry.date)}
                </span>
                {entry.noExport && (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-muted)] opacity-70">
                    private
                  </span>
                )}
              </div>
              <p className="font-serif text-[13px] leading-[1.45] text-[var(--ink-muted)] line-clamp-2">
                {preview || (
                  <span className="italic">No entry yet.</span>
                )}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
