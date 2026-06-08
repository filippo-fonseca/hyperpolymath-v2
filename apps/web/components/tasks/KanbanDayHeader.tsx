"use client";

import { useRef } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fromYmd, toYmd } from "@/lib/tasks/date-shortcuts";

interface Props {
  /** Active day in YYYY-MM-DD form (URL-synced via TasksClient). */
  dateYmd: string;
  onDateChange: (ymd: string) => void;
  /** Count of tasks without a due date. Clicking the pill opens the inbox tray. */
  inboxCount: number;
  inboxOpen: boolean;
  onInboxToggle: () => void;
}

/**
 * Date navigator above the kanban day view. Arrows step ±1 day, Today
 * snaps back, the date label opens a native picker, and the Inbox pill
 * surfaces undated tasks (toggles a slide-down tray rendered by parent).
 */
export function KanbanDayHeader({
  dateYmd,
  onDateChange,
  inboxCount,
  inboxOpen,
  onInboxToggle,
}: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const date = fromYmd(dateYmd);
  const today = new Date();
  const isToday = isSameDay(date, today);

  return (
    <div className="flex items-center justify-between gap-4 px-1 pb-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onDateChange(toYmd(addDays(date, -1)))}
            aria-label="Previous day"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 font-mono text-[11px] uppercase tracking-[0.06em]",
              isToday && "text-[var(--ink-muted)]",
            )}
            onClick={() => onDateChange(toYmd(today))}
            disabled={isToday}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onDateChange(toYmd(addDays(date, 1)))}
            aria-label="Next day"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </Button>
        </div>

        {/* Date label as the calendar trigger. Clicking opens the native
            picker (showPicker on browsers that support it; focus + click
            fallback otherwise). */}
        <button
          type="button"
          className="relative font-serif text-base text-[var(--ink)] hover:text-[var(--ink)] cursor-pointer-always"
          onClick={() => pickerRef.current?.showPicker?.() ?? pickerRef.current?.focus()}
          title="Jump to a date"
        >
          {format(date, "EEEE, MMMM d, yyyy")}
          {isToday ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              · Today
            </span>
          ) : null}
          <input
            ref={pickerRef}
            type="date"
            value={dateYmd}
            onChange={(e) => {
              if (e.target.value) onDateChange(e.target.value);
            }}
            // The native input is invisible — the visible button is the
            // real affordance; we position 0×0 so the picker anchors near
            // the label.
            className="absolute left-0 top-full h-0 w-0 opacity-0"
            aria-hidden
            tabIndex={-1}
          />
        </button>
      </div>

      <button
        type="button"
        onClick={onInboxToggle}
        aria-pressed={inboxOpen}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-150 ease-out cursor-pointer-always",
          inboxOpen
            ? "border-[var(--edge)] bg-[var(--surface-raised)] text-[var(--ink)]"
            : "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]",
        )}
      >
        <Inbox size={12} strokeWidth={1.5} />
        Inbox
        {inboxCount > 0 ? (
          <span className="rounded bg-[var(--ink-muted)]/15 px-1 text-[var(--ink)]">
            {inboxCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
