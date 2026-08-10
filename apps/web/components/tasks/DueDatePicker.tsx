"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import {
  fromYmd,
  nextWeekYmd,
  thisSundayYmd,
  toYmd,
  tomorrowYmd,
} from "@/lib/tasks/date-shortcuts";
import {
  REMINDER_OFFSETS,
  normalizeReminderOffsets,
  shortReminderLabel,
} from "@/lib/tasks/reminders";

/**
 * Issue #396 — the Notion-style due popover: quick presets, a month calendar,
 * an optional time-of-day, and the reminder-offset ladder, all in one
 * craft-glass surface. Fully controlled — emits patches, never talks to the
 * server; the host owns form state and persistence.
 *
 * Interaction grammar: presets commit-and-close (they are shortcuts), the
 * calendar keeps the popover open so time + reminders can be layered on in
 * the same visit. Time and reminders only render once a date exists — both
 * are meaningless without one, and the server clears them when the date
 * clears.
 */

export interface DuePatch {
  dueDate?: string | null;
  dueTime?: string | null;
  reminderOffsetsMin?: number[];
}

interface Props {
  /** "YYYY-MM-DD" or null. */
  dueDate: string | null;
  /** "HH:MM" 24h or null (= whole-day). */
  dueTime: string | null;
  /** Sorted preset offsets, minutes before the due moment. */
  reminderOffsetsMin: number[];
  onChange: (patch: DuePatch) => void;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  /** Custom trigger node; defaults to the value button. */
  trigger?: ReactNode;
}

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Token-driven day-cell states, same inline-style approach as
// JournalCalendar (Tailwind scan gap §0). Butter is the tasks feature hue
// (due-today chips already wear it), so selection reads as "this task's day".
const CELL_SELECTED: CSSProperties = {
  background: "var(--tint-butter-bg)",
  boxShadow: "inset 0 0 0 1.5px var(--tint-butter-edge)",
};
const CELL_TODAY_RING: CSSProperties = {
  boxShadow:
    "inset 0 0 0 1px color-mix(in srgb, var(--tint-butter-edge) 55%, transparent)",
};

/** "Fri, Aug 14" — year appended only when it isn't the current one. */
export function formatDueLabel(ymd: string): string {
  const d = fromYmd(ymd);
  return format(
    d,
    d.getFullYear() === new Date().getFullYear() ? "EEE, MMM d" : "EEE, MMM d, yyyy",
  );
}

export function DueDatePicker({
  dueDate,
  dueTime,
  reminderOffsetsMin,
  onChange,
  disabled = false,
  align = "start",
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() =>
    dueDate ? fromYmd(dueDate) : new Date(),
  );
  // Reminder list stays collapsed behind a ghost row until asked for (or a
  // reminder already exists) so the empty popover stays short.
  const [remindersOpen, setRemindersOpen] = useState(false);
  const showReminderList = remindersOpen || reminderOffsetsMin.length > 0;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Re-anchor the month on every open; a stale view month is disorienting.
      setViewDate(dueDate ? fromYmd(dueDate) : new Date());
      setRemindersOpen(false);
    }
  }

  function pickPreset(ymd: string) {
    onChange({ dueDate: ymd });
    setOpen(false);
  }

  function toggleReminder(minutes: number) {
    const has = reminderOffsetsMin.includes(minutes);
    onChange({
      reminderOffsetsMin: normalizeReminderOffsets(
        has
          ? reminderOffsetsMin.filter((m) => m !== minutes)
          : [...reminderOffsetsMin, minutes],
      ),
    });
  }

  const todayYmd = toYmd(new Date());
  const presets: { label: string; ymd: string }[] = [
    { label: "Today", ymd: todayYmd },
    { label: "Tomorrow", ymd: tomorrowYmd() },
    { label: "This Sunday", ymd: thisSundayYmd() },
    { label: "Next week", ymd: nextWeekYmd() },
  ];

  // ── Calendar grid ─────────────────────────────────────────────────────────
  const gridDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewDate)),
    end: endOfWeek(endOfMonth(viewDate)),
  });

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            type="button"
            disabled={disabled}
            aria-label="Due date"
            className={cn(
              "cursor-pointer-always inline-flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg",
              "border border-[var(--edge)] bg-[var(--surface)] px-2.5 text-left",
              "transition-colors duration-[160ms] ease-out",
              "hover:border-[var(--edge-strong)] disabled:opacity-40",
              open && "border-[var(--edge-strong)]",
            )}
          >
            <CalendarDays
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-[var(--ink-faint)]"
            />
            {dueDate ? (
              <span className="truncate font-mono text-meta tabular-nums text-[var(--ink)]">
                {formatDueLabel(dueDate)}
                {dueTime ? ` · ${dueTime}` : ""}
              </span>
            ) : (
              <span className="text-meta text-[var(--ink-faint)]">Set due date</span>
            )}
            {dueDate && reminderOffsetsMin.length > 0 && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-micro tabular-nums text-[var(--ink-muted)]">
                <Bell size={12} strokeWidth={1.75} />
                {reminderOffsetsMin.length}
              </span>
            )}
          </button>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "craft-glass-pop z-50 w-[276px] overflow-hidden font-sans text-[var(--ink)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1",
          )}
        >
          {/* Quick presets — 2×2, each with its resolved date for sanity. */}
          <div className="grid grid-cols-2 gap-1 p-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => pickPreset(p.ymd)}
                className={cn(
                  "cursor-pointer-always flex flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left",
                  "transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]",
                )}
              >
                <span className="text-meta text-[var(--ink)]">{p.label}</span>
                <span className="font-mono text-micro tabular-nums text-[var(--ink-faint)]">
                  {format(fromYmd(p.ymd), "EEE, MMM d")}
                </span>
              </button>
            ))}
          </div>

          {/* Month calendar. */}
          <div className="border-t border-[var(--edge)] px-2 pb-2 pt-1.5">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-meta font-medium text-[var(--ink)]">
                {format(viewDate, "MMMM yyyy")}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setViewDate((d) => subMonths(d, 1))}
                  aria-label="Previous month"
                  className="cursor-pointer-always rounded-md p-1 text-[var(--ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  <ChevronLeft size={14} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewDate((d) => addMonths(d, 1))}
                  aria-label="Next month"
                  className="cursor-pointer-always rounded-md p-1 text-[var(--ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  <ChevronRight size={14} strokeWidth={1.75} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7">
              {DOW.map((d) => (
                <div
                  key={d}
                  className="py-0.5 text-center text-micro font-medium text-[var(--ink-faint)]"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridDays.map((day) => {
                const ymd = toYmd(day);
                const selected = ymd === dueDate;
                const inMonth = isSameMonth(day, viewDate);
                const today = isToday(day);
                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => {
                      onChange({ dueDate: ymd });
                      if (!inMonth) setViewDate(day);
                    }}
                    aria-label={format(day, "MMMM d, yyyy")}
                    aria-current={selected ? "date" : undefined}
                    style={
                      selected
                        ? CELL_SELECTED
                        : today
                          ? CELL_TODAY_RING
                          : undefined
                    }
                    className={cn(
                      "cursor-pointer-always flex h-8 items-center justify-center rounded-md font-mono text-meta tabular-nums",
                      "transition-colors duration-[160ms] ease-out motion-reduce:transition-none",
                      selected
                        ? "font-semibold text-[var(--tint-butter-ink)]"
                        : today
                          ? "font-semibold text-[var(--tint-butter-ink)] hover:bg-[var(--hover)]"
                          : inMonth
                            ? "text-[var(--ink-muted)] hover:bg-[var(--hover)]"
                            : "text-[var(--ink-faint)] opacity-50 hover:bg-[var(--hover)]",
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time — only meaningful once a date exists. */}
          {dueDate && (
            <div className="border-t border-[var(--edge)] p-1.5">
              {dueTime === null ? (
                <button
                  type="button"
                  onClick={() => onChange({ dueTime: "09:00" })}
                  className="cursor-pointer-always flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-meta text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  <Plus size={14} strokeWidth={1.75} />
                  Add time
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg px-2 py-1">
                  <Clock
                    size={14}
                    strokeWidth={1.75}
                    className="shrink-0 text-[var(--ink-faint)]"
                  />
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) =>
                      onChange({ dueTime: e.target.value ? e.target.value : null })
                    }
                    aria-label="Due time"
                    className={cn(
                      "h-7 flex-1 rounded-md border border-[var(--edge)] bg-[var(--surface)] px-2",
                      "font-mono text-meta tabular-nums text-[var(--ink)] outline-none",
                      "focus-visible:border-[var(--edge-strong)]",
                      "transition-colors duration-[160ms] ease-out",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ dueTime: null })}
                    title="Remove time"
                    aria-label="Remove time"
                    className="cursor-pointer-always rounded-sm p-1 text-[var(--ink-faint)] transition-colors duration-[160ms] hover:text-[var(--ink)]"
                  >
                    <X size={12} strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reminders — the fixed preset ladder, multi-select. */}
          {dueDate && (
            <div className="border-t border-[var(--edge)] p-1.5">
              {!showReminderList ? (
                <button
                  type="button"
                  onClick={() => setRemindersOpen(true)}
                  className="cursor-pointer-always flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-meta text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  <Bell size={14} strokeWidth={1.75} />
                  Add reminder
                </button>
              ) : (
                <div className="px-1 pb-1">
                  <div className="flex items-center gap-1.5 px-1 pb-1.5 pt-1">
                    <Bell
                      size={12}
                      strokeWidth={1.75}
                      className="text-[var(--ink-faint)]"
                    />
                    <span className="text-micro uppercase tracking-wide text-[var(--ink-faint)]">
                      Remind before due
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {REMINDER_OFFSETS.map((o) => {
                      const active = reminderOffsetsMin.includes(o.minutes);
                      return (
                        <button
                          key={o.minutes}
                          type="button"
                          onClick={() => toggleReminder(o.minutes)}
                          aria-pressed={active}
                          title={o.label}
                          style={
                            active
                              ? {
                                  background: "var(--tint-butter-bg)",
                                  boxShadow:
                                    "inset 0 0 0 1px var(--tint-butter-edge)",
                                }
                              : undefined
                          }
                          className={cn(
                            "cursor-pointer-always rounded-md px-1 py-1.5 text-center font-mono text-micro tabular-nums",
                            "transition-colors duration-[160ms] ease-out",
                            active
                              ? "text-[var(--tint-butter-ink)]"
                              : "text-[var(--ink-muted)] hover:bg-[var(--hover)]",
                          )}
                        >
                          {shortReminderLabel(o.minutes)}
                        </button>
                      );
                    })}
                  </div>
                  {reminderOffsetsMin.length > 0 && dueTime === null && (
                    <p className="px-1 pt-1.5 text-micro text-[var(--ink-faint)]">
                      Timeless tasks remind relative to 09:00.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Clear — date, time, and reminders in one stroke. */}
          {dueDate && (
            <div className="border-t border-[var(--edge)] p-1.5">
              <button
                type="button"
                onClick={() => {
                  onChange({ dueDate: null, dueTime: null, reminderOffsetsMin: [] });
                  setOpen(false);
                }}
                className="cursor-pointer-always flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
              >
                <span className="text-meta text-[var(--ink-muted)]">Clear due date</span>
                <span className="font-mono text-micro text-[var(--ink-faint)]">
                  Move to Inbox
                </span>
              </button>
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
