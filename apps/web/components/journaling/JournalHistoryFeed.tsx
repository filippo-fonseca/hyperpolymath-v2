"use client";

import { format, isToday, parseISO, subDays } from "date-fns";
import type { JournalEntry } from "@/app/actions/journal";
import { EmptyState } from "@/components/ui/EmptyState";
import { stripReferences } from "@/lib/references/token";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { NotebookPen } from "lucide-react";

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
 * JournalHistoryFeed — the past entries as a column of tinted date cards
 * (jul-29 craft restyle).
 *
 * It follows the wiki journal rail's card idiom exactly: each day keeps a
 * stable pastel of its own, hashed from its ISO date, so the same day is the
 * same colour wherever it is shown. Pastel on the fill, the saturated hue only
 * on the rim and on hover; shadow deepens on hover, nothing moves.
 *
 * The active day is the one card that wears its full saturated edge, so the
 * selection reads without a second colour vocabulary. Clicking a card calls
 * onSelectDate to navigate the editor to that date.
 */
export function JournalHistoryFeed({ entries, selectedDate, onSelectDate }: Props) {
  if (entries.length === 0) {
    return (
      <aside aria-label="Journal history">
        <EmptyState
          size="section"
          className="tint-peach"
          icon={<NotebookPen strokeWidth={1.5} />}
          title="No entries yet"
          description="Answer today's question and it starts here."
        />
      </aside>
    );
  }

  return (
    <aside aria-label="Journal history">
      <div className="custom-scrollbar flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1 md:max-h-[calc(100vh-180px)]">
        {entries.map((entry) => {
          const isSelected = entry.date === selectedDate;
          // Stripped to label text rather than chipped: this preview lives
          // inside the row's own <button>, so it can hold no interactive
          // pill. A reference reads as its label, which is what the sentence
          // meant anyway.
          const preview = stripReferences(entry.mainResponse ?? "").trim();

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelectDate(entry.date)}
              className={cn(
                tintFor(entry.date),
                "craft-card craft-card-hover w-full shrink-0 p-3 text-left cursor-pointer-always",
                // Entity identity: the day's own pastel fills the plate.
                "bg-[var(--tint-bg)]",
                isSelected && "border-[var(--tint-edge)]"
              )}
              aria-current={isSelected ? "date" : undefined}
              aria-label={`Journal entry for ${formatDateLabel(entry.date)}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-meta font-medium text-[var(--ink)]">
                  {formatDateLabel(entry.date)}
                </span>
                {entry.noExport && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-micro text-[var(--tint-ink)]">
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full bg-[var(--tint-edge)]"
                    />
                    Private
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-meta text-[var(--ink-muted)]">
                {preview || <span className="text-[var(--ink-faint)]">No entry yet.</span>}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
