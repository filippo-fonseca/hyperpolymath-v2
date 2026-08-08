"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  fromYmd,
  nextWeekYmd,
  thisSundayYmd,
  toYmd,
  tomorrowYmd,
} from "@/lib/tasks/date-shortcuts";

interface Props {
  /** Called with a YYYY-MM-DD string or null to clear the due date. */
  onPick: (dateYmd: string | null) => void;
  /** Optional anchor — falls back to today. */
  from?: Date;
  /**
   * The day the tasks being moved currently sit on: the viewed date on the
   * kanban, the overdue date in the overdue panel, `null` for the undated
   * Inbox. "Today" only appears when it would actually move something, so the
   * day view never offers to move today's tasks to today.
   */
  currentYmd?: string | null;
  /** Visual variant — "bar" for the bottom selection toolbar,
   * "inline" for the detail panel row. */
  variant?: "bar" | "inline";
  /** Show a "Clear due date" item that calls onPick(null). */
  allowClear?: boolean;
  /** Disable everything (e.g. while a transition is in flight). */
  disabled?: boolean;
}

/**
 * Shared "Move to…" affordance — used by the kanban bottom selection
 * toolbar (variant="bar") and the task detail panel (variant="inline").
 *
 * Surfaces "Tomorrow", "This Sunday", "Next week", a calendar picker for
 * custom dates, and (optional) "Clear due date". Each shortcut shows the
 * resolved date in mono caption so the user can sanity-check before
 * committing.
 */
export function MoveToMenu({
  onPick,
  from = new Date(),
  currentYmd,
  variant = "bar",
  allowClear = false,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const customRef = useRef<HTMLInputElement>(null);
  const todayYmd = toYmd(new Date());
  // Overdue tasks and the undated Inbox both want this constantly; the day
  // view wants it on every day except the one it is already showing.
  const showToday = currentYmd !== todayYmd;
  const tomorrow = tomorrowYmd(from);
  const sunday = thisSundayYmd(from);
  const next = nextWeekYmd(from);

  const triggerClass =
    variant === "bar"
      ? "inline-flex items-center gap-2 rounded-full bg-[var(--canvas)]/15 px-3 py-1.5 text-micro text-[var(--canvas)] transition-colors duration-[160ms] ease-out hover:bg-[var(--canvas)]/25 disabled:opacity-40"
      : "inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-micro text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)] disabled:opacity-40";

  function pick(dateYmd: string | null) {
    setOpen(false);
    onPick(dateYmd);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn("cursor-pointer-always", triggerClass)}
        >
          <CalendarIcon size={12} strokeWidth={1.75} />
          {variant === "bar" ? "Move to" : "Move to…"}
          <ChevronDown size={12} strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={variant === "bar" ? "center" : "start"}
        side="top"
        className="w-[260px] p-1.5 border-[var(--edge)] bg-[var(--surface-raised)]"
      >
        <ul className="space-y-0.5">
          {showToday ? (
            <ShortcutRow
              label="Today"
              sub={format(fromYmd(todayYmd), "EEE, MMM d")}
              onClick={() => pick(todayYmd)}
            />
          ) : null}
          <ShortcutRow
            label="Tomorrow"
            sub={format(fromYmd(tomorrow), "EEE, MMM d")}
            onClick={() => pick(tomorrow)}
          />
          <ShortcutRow
            label="This Sunday"
            sub={format(fromYmd(sunday), "EEE, MMM d")}
            onClick={() => pick(sunday)}
          />
          <ShortcutRow
            label="Next week"
            sub={format(fromYmd(next), "EEE, MMM d")}
            onClick={() => pick(next)}
          />
          {allowClear ? (
            <ShortcutRow
              label="Clear due date"
              sub="Move to Inbox"
              onClick={() => pick(null)}
            />
          ) : null}
        </ul>
        <div className="my-1.5 h-px bg-[var(--edge)]" />
        <button
          type="button"
          onClick={() => customRef.current?.showPicker?.() ?? customRef.current?.focus()}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-[var(--surface)] cursor-pointer-always"
        >
          <span className="text-meta text-[var(--ink)]">Custom date…</span>
          <input
            ref={customRef}
            type="date"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.value) pick(e.target.value);
            }}
            className="appearance-none border-none bg-transparent font-mono text-micro tabular-nums text-[var(--ink-muted)] outline-none cursor-pointer-always"
          />
        </button>
      </PopoverContent>
    </Popover>
  );
}

function ShortcutRow({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-[var(--surface)] cursor-pointer-always"
      >
        <span className="text-meta text-[var(--ink)]">{label}</span>
        <span className="font-mono text-micro tabular-nums text-[var(--ink-muted)]">
          {sub}
        </span>
      </button>
    </li>
  );
}
