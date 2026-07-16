"use client";

import {
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { JournalEntry } from "@/app/actions/journal";
import { cn } from "@/lib/utils";

type ViewMode = "week" | "month" | "year";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Token-driven day-cell states. Inline styles keep the color-mix tints and the
// today ring out of the Tailwind scan gap (§0) and resolve in both themes.
const CELL_BASE: CSSProperties = { background: "var(--sd-box)" };
const CELL_ENTRY: CSSProperties = {
  background: "color-mix(in srgb, var(--sd-accent) 16%, var(--sd-box))",
};
const CELL_SELECTED: CSSProperties = {
  background: "color-mix(in srgb, var(--sd-accent) 30%, var(--sd-box))",
  boxShadow: "inset 0 0 0 1px var(--sd-accent)",
};
const CELL_TODAY_RING: CSSProperties = {
  boxShadow: "inset 0 0 0 1px var(--sd-accent)",
};

interface Props {
  selectedDate: string;
  /**
   * Journaling supplies its entries; the marked days are derived from their
   * `.date`. Generalized in Phase 30 so other surfaces (the Wiki Daily Pages
   * calendar) can pass `markedDates` directly instead — exactly one of `entries`
   * or `markedDates` is expected, with `markedDates` taking precedence.
   */
  entries?: JournalEntry[];
  /** A set of yyyy-MM-dd ISO dates to mark (Phase 30 generalization). */
  markedDates?: Set<string>;
  onSelectDate: (date: string) => void;
  /** Accessible label for the calendar landmark. Defaults to the journal label. */
  ariaLabel?: string;
}

export function JournalCalendar({
  selectedDate,
  entries,
  markedDates,
  onSelectDate,
  ariaLabel = "Journal calendar",
}: Props) {
  const selected = parseISO(selectedDate);
  const [viewDate, setViewDate] = useState<Date>(selected);
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  // When the arrows in the header flip the day, snap the calendar to show the
  // new date's month/week so the highlight stays visible.
  useEffect(() => {
    setViewDate(parseISO(selectedDate));
  }, [selectedDate]);

  // Marked days: prefer an explicit markedDates set, else derive from entries.
  const entryDates = markedDates ?? new Set((entries ?? []).map((e) => e.date));

  function handleDayClick(day: Date) {
    onSelectDate(format(day, "yyyy-MM-dd"));
  }

  function navPrev() {
    if (viewMode === "month") setViewDate((d) => subMonths(d, 1));
    else if (viewMode === "week") setViewDate((d) => subWeeks(d, 1));
    else setViewDate((d) => subYears(d, 1));
  }

  function navNext() {
    if (viewMode === "month") setViewDate((d) => addMonths(d, 1));
    else if (viewMode === "week") setViewDate((d) => addWeeks(d, 1));
    else setViewDate((d) => addYears(d, 1));
  }

  function navLabel(): string {
    if (viewMode === "month") return format(viewDate, "MMM yyyy");
    if (viewMode === "week") {
      const s = startOfWeek(viewDate);
      const e = endOfWeek(viewDate);
      if (format(s, "MMM yyyy") === format(e, "MMM yyyy")) {
        return `${format(s, "MMM d")} – ${format(e, "d")}`;
      }
      return `${format(s, "MMM d")} – ${format(e, "MMM d")}`;
    }
    return format(viewDate, "yyyy");
  }

  // Day-cell style resolver shared by the month + week grids.
  function cellStyle(isSelected: boolean, isCurrDay: boolean, hasEntry: boolean): CSSProperties {
    if (isSelected) return CELL_SELECTED;
    if (isCurrDay) return { ...(hasEntry ? CELL_ENTRY : CELL_BASE), ...CELL_TODAY_RING };
    if (hasEntry) return CELL_ENTRY;
    return CELL_BASE;
  }

  // ── Month grid ────────────────────────────────────────────────────────────
  function renderMonthGrid() {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    return (
      <>
        <div className="mb-1 grid grid-cols-7">
          {DOW.map((d) => (
            <div
              key={d}
              className="py-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]"
            >
              {d}
            </div>
          ))}
        </div>
        {/* Hairline grid: the wrapper line color shows through the 1px gaps. */}
        <div
          className="grid grid-cols-7 gap-px overflow-hidden rounded-[8px]"
          style={{ background: "var(--sd-line)" }}
        >
          {days.map((day) => {
            const iso = format(day, "yyyy-MM-dd");
            const isSelected = isSameDay(day, selected);
            const inMonth = isSameMonth(day, viewDate);
            const isCurrDay = isToday(day);
            const hasEntry = entryDates.has(iso);

            return (
              <button
                key={iso}
                type="button"
                onClick={() => handleDayClick(day)}
                disabled={!inMonth}
                aria-label={format(day, "MMMM d, yyyy")}
                aria-current={isSelected ? "date" : undefined}
                style={cellStyle(isSelected, isCurrDay, hasEntry)}
                className={cn(
                  "relative flex h-9 w-full items-center justify-center text-[12px] transition-colors duration-150",
                  !inMonth && "pointer-events-none opacity-40",
                  isSelected
                    ? "font-semibold text-[var(--sd-accent)]"
                    : isCurrDay
                      ? "font-semibold text-[var(--sd-accent)] hover:bg-[var(--sd-hover)]"
                      : "text-[var(--sd-ink)] hover:bg-[var(--sd-hover)]",
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  // ── Week grid ─────────────────────────────────────────────────────────────
  function renderWeekGrid() {
    const weekStart = startOfWeek(viewDate);
    const weekEnd = endOfWeek(viewDate);
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    return (
      <div
        className="grid grid-cols-7 gap-px overflow-hidden rounded-[8px]"
        style={{ background: "var(--sd-line)" }}
      >
        {days.map((day) => {
          const iso = format(day, "yyyy-MM-dd");
          const isSelected = isSameDay(day, selected);
          const isCurrDay = isToday(day);
          const hasEntry = entryDates.has(iso);

          return (
            <button
              key={iso}
              type="button"
              onClick={() => handleDayClick(day)}
              aria-label={format(day, "MMMM d, yyyy")}
              aria-current={isSelected ? "date" : undefined}
              style={cellStyle(isSelected, isCurrDay, hasEntry)}
              className={cn(
                "relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[12px] transition-colors duration-150",
                isSelected
                  ? "font-semibold text-[var(--sd-accent)]"
                  : isCurrDay
                    ? "font-semibold text-[var(--sd-accent)] hover:bg-[var(--sd-hover)]"
                    : "text-[var(--sd-ink)] hover:bg-[var(--sd-hover)]",
              )}
            >
              <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--sd-ink-faint)]">
                {format(day, "EEE")}
              </span>
              <span>{format(day, "d")}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // ── Year grid ─────────────────────────────────────────────────────────────
  function renderYearGrid() {
    const yr = viewDate.getFullYear();

    return (
      <div
        className="grid grid-cols-3 gap-px overflow-hidden rounded-[8px]"
        style={{ background: "var(--sd-line)" }}
      >
        {MONTH_NAMES.map((name, i) => {
          const monthDate = new Date(yr, i, 1);
          const isCurrentMonth = isSameMonth(monthDate, new Date());
          const isSelectedMonth = isSameMonth(monthDate, selected);
          const prefix = `${yr}-${String(i + 1).padStart(2, "0")}`;
          let count = 0;
          for (const d of entryDates) if (d.startsWith(prefix)) count++;

          return (
            <button
              key={name}
              type="button"
              onClick={() => {
                setViewDate(monthDate);
                setViewMode("month");
              }}
              style={
                isSelectedMonth
                  ? CELL_SELECTED
                  : isCurrentMonth
                    ? { ...CELL_BASE, ...CELL_TODAY_RING }
                    : CELL_BASE
              }
              className={cn(
                "flex flex-col items-center gap-1 px-2 py-3 transition-colors duration-150",
                isSelectedMonth || isCurrentMonth
                  ? "font-semibold text-[var(--sd-accent)]"
                  : "text-[var(--sd-ink)] hover:bg-[var(--sd-hover)]",
                isCurrentMonth && !isSelectedMonth && "hover:bg-[var(--sd-hover)]",
              )}
            >
              <span className="text-[13px]">{name}</span>
              {count > 0 && (
                <span className="font-mono text-[8px] text-[var(--sd-ink-faint)]">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "sticky top-4 flex flex-col gap-3 self-start rounded-[14px] p-4",
        "border border-[var(--sd-line)] bg-[var(--sd-box)]",
        "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]",
      )}
      aria-label={ariaLabel}
    >
      {/* View-mode segmented control */}
      <div
        className="flex items-center gap-0.5 rounded-[8px] border border-[var(--sd-line)] p-0.5"
        style={{ background: "var(--sd-input)" }}
      >
        {(["week", "month", "year"] as ViewMode[]).map((mode) => {
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={active ? { background: "var(--sd-box)" } : undefined}
              className={cn(
                "flex-1 rounded-[6px] py-1 font-mono text-[9.5px] uppercase tracking-[0.07em] transition-colors duration-150",
                active
                  ? "text-[var(--sd-accent)]"
                  : "text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]",
              )}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Nav row — ghost icon-buttons + mono label */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous"
          onClick={navPrev}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--sd-ink-faint)] transition-colors duration-150 hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
        >
          <ChevronLeft size={13} strokeWidth={2} />
        </button>
        <span className="flex-1 truncate text-center font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink)]">
          {navLabel()}
        </span>
        <button
          type="button"
          aria-label="Next"
          onClick={navNext}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--sd-ink-faint)] transition-colors duration-150 hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
        >
          <ChevronRight size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Grid */}
      <div>
        {viewMode === "month" && renderMonthGrid()}
        {viewMode === "week" && renderWeekGrid()}
        {viewMode === "year" && renderYearGrid()}
      </div>
    </aside>
  );
}
