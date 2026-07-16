"use client";

import { format, isToday, parseISO, subDays } from "date-fns";
import type { CSSProperties } from "react";
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

// Selected row: a faint accent wash plus a 1px accent bar down the left edge.
// Inline styles keep the color-mix + inset bar out of the Tailwind scan gap (§0).
const ROW_SELECTED: CSSProperties = {
  background: "color-mix(in srgb, var(--sd-accent) 12%, var(--sd-box))",
  boxShadow: "inset 2px 0 0 0 var(--sd-accent)",
};

/**
 * JournalHistoryFeed — scrollable list of past journal entries (sd register).
 *
 * A single `--sd-box` plate holds hairline-separated rows (`divide-y`,
 * `--sd-line`). Each row shows:
 *   - Date label (Today / Yesterday / "Mon, Jun 10")
 *   - A `private` sd status pill when the entry is excluded from AI export
 *   - Truncated mainResponse preview (or "No entry yet" when empty)
 *
 * Clicking a row calls onSelectDate to navigate the editor to that date. The
 * active row gets a faint accent wash and a left accent bar.
 *
 * Empty state: a single `--sd-box` plate reading "No entries yet."
 */
export function JournalHistoryFeed({ entries, selectedDate, onSelectDate }: Props) {
  if (entries.length === 0) {
    return (
      <aside aria-label="Journal history">
        <div className="rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-4 py-3 text-center">
          <p className="text-[13px] text-[var(--sd-ink-faint)]">No entries yet.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Journal history">
      <div className="max-h-[60vh] overflow-y-auto rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] md:max-h-[calc(100vh-180px)]">
        <div className="divide-y divide-[var(--sd-line)]">
          {entries.map((entry) => {
            const isSelected = entry.date === selectedDate;
            const preview = entry.mainResponse?.trim();

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectDate(entry.date)}
                style={isSelected ? ROW_SELECTED : undefined}
                className={cn(
                  "w-full px-4 py-3 text-left transition-colors duration-150",
                  !isSelected && "hover:bg-[var(--sd-hover)]",
                )}
                aria-current={isSelected ? "date" : undefined}
                aria-label={`Journal entry for ${formatDateLabel(entry.date)}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[13px] font-semibold",
                      isSelected ? "text-[var(--sd-accent)]" : "text-[var(--sd-ink)]",
                    )}
                  >
                    {formatDateLabel(entry.date)}
                  </span>
                  {entry.noExport && (
                    <span className="sd-status-pill sd-tint-idle shrink-0 font-mono uppercase tracking-[0.06em]">
                      private
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-[13px] leading-[1.45] text-[var(--sd-ink-dull)]">
                  {preview || <span className="text-[var(--sd-ink-faint)]">No entry yet.</span>}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
