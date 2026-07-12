"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fromYmd, nextWeekYmd, thisSundayYmd, tomorrowYmd } from "@/lib/tasks/date-shortcuts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";

interface Props {
  /** Called with a YYYY-MM-DD string or null to clear the due date. */
  onPick: (dateYmd: string | null) => void;
  /** Optional anchor — falls back to today. */
  from?: Date;
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
  variant = "bar",
  allowClear = false,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const customRef = useRef<HTMLInputElement>(null);
  const tomorrow = tomorrowYmd(from);
  const sunday = thisSundayYmd(from);
  const next = nextWeekYmd(from);

  const triggerClass =
    variant === "bar"
      ? "inline-flex min-h-8 items-center gap-1.5 rounded-[0.375rem] bg-[var(--deck-active)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--deck-ink)] hover:bg-[var(--deck-selected)] disabled:opacity-40 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      : "inline-flex min-h-8 items-center gap-1.5 rounded-[0.375rem] border border-[var(--deck-line)] bg-[var(--deck-panel)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--deck-ink-dull)] hover:bg-[var(--deck-hover)] hover:text-[var(--deck-ink)] disabled:opacity-40 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]";

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
        className="w-[260px] border-[var(--deck-line)] bg-[var(--deck-panel)] p-1.5"
      >
        <ul className="space-y-0.5">
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
            <ShortcutRow label="Clear due date" sub="Move to Inbox" onClick={() => pick(null)} />
          ) : null}
        </ul>
        <div className="my-1.5 h-px bg-[var(--edge)]" />
        <button
          type="button"
          onClick={() => customRef.current?.showPicker?.() ?? customRef.current?.focus()}
          className="flex min-h-8 w-full items-center justify-between rounded-[0.375rem] px-2 py-1.5 text-left hover:bg-[var(--deck-hover)] cursor-pointer-always focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="font-sans text-[13px] text-[var(--ink)]">Custom date…</span>
          <input
            ref={customRef}
            type="date"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.value) pick(e.target.value);
            }}
            className="appearance-none bg-transparent border-none font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] outline-none cursor-pointer-always"
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
        className="flex min-h-8 w-full items-center justify-between rounded-[0.375rem] px-2 py-1.5 text-left hover:bg-[var(--deck-hover)] cursor-pointer-always focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      >
        <span className="font-sans text-[13px] text-[var(--ink)]">{label}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          {sub}
        </span>
      </button>
    </li>
  );
}
