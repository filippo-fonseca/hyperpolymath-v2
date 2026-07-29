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

// Token-driven day-cell states (jul-29 craft restyle). Inline styles keep the
// color-mix tints and the today ring out of the Tailwind scan gap (§0) and
// resolve in both themes.
//
// The written days wear ONE hue rather than a per-day hash: a 42-cell grid of
// eight rotating pastels reads as confetti, not as a calendar. Peach is the
// journal's feature hue (it is the empty state's tint too), so a month of
// entries reads as a single warm streak with the plain days quiet behind it.
const CELL_BASE: CSSProperties = { background: "var(--surface-raised)" };
const CELL_ENTRY: CSSProperties = {
  background: "var(--tint-peach-bg)",
};
const CELL_SELECTED: CSSProperties = {
  background: "var(--tint-peach-bg)",
  boxShadow: "inset 0 0 0 1.5px var(--tint-peach-edge)",
};
const CELL_TODAY_RING: CSSProperties = {
  boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--tint-peach-edge) 55%, transparent)",
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
              className="py-1 text-center text-micro font-medium text-[var(--ink-faint)]"
            >
              {d}
            </div>
          ))}
        </div>
        {/* Hairline grid: the wrapper line color shows through the 1px gaps. */}
        <div
          className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--edge)]"
          style={{ background: "var(--edge)" }}
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
                  "relative flex h-9 w-full items-center justify-center text-meta cursor-pointer-always",
                  "transition-colors duration-[160ms] ease-out motion-reduce:transition-none",
                  !inMonth && "pointer-events-none opacity-40",
                  isSelected
                    ? "font-semibold text-[var(--tint-peach-ink)]"
                    : isCurrDay
                      ? "font-semibold text-[var(--tint-peach-ink)] hover:bg-[var(--hover)]"
                      : hasEntry
                        ? "text-[var(--tint-peach-ink)] hover:bg-[var(--hover)]"
                        : "text-[var(--ink-muted)] hover:bg-[var(--hover)]",
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
        className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--edge)]"
        style={{ background: "var(--edge)" }}
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
                "relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-meta cursor-pointer-always",
                "transition-colors duration-[160ms] ease-out motion-reduce:transition-none",
                isSelected
                  ? "font-semibold text-[var(--tint-peach-ink)]"
                  : isCurrDay
                    ? "font-semibold text-[var(--tint-peach-ink)] hover:bg-[var(--hover)]"
                    : hasEntry
                      ? "text-[var(--tint-peach-ink)] hover:bg-[var(--hover)]"
                      : "text-[var(--ink-muted)] hover:bg-[var(--hover)]",
              )}
            >
              <span className="text-micro text-[var(--ink-faint)]">{format(day, "EEE")}</span>
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
        className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-[var(--edge)]"
        style={{ background: "var(--edge)" }}
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
                "flex flex-col items-center gap-1 px-2 py-3 cursor-pointer-always",
                "transition-colors duration-[160ms] ease-out motion-reduce:transition-none",
                isSelectedMonth || isCurrentMonth
                  ? "font-semibold text-[var(--tint-peach-ink)]"
                  : "text-[var(--ink-muted)] hover:bg-[var(--hover)]",
                isCurrentMonth && !isSelectedMonth && "hover:bg-[var(--hover)]",
              )}
            >
              <span className="text-meta">{name}</span>
              {count > 0 && (
                <span className="text-micro tabular-nums text-[var(--ink-faint)]">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <aside
      className="craft-card sticky top-4 flex flex-col gap-3 self-start rounded-2xl p-4"
      aria-label={ariaLabel}
    >
      {/* View-mode segmented control — active segment is a raised white plate. */}
      <div className="flex items-center gap-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-1">
        {(["week", "month", "year"] as ViewMode[]).map((mode) => {
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={active}
              className={cn(
                "flex-1 rounded px-2 py-1 text-micro cursor-pointer-always",
                "transition-colors duration-[160ms] ease-out motion-reduce:transition-none",
                active
                  ? "bg-[var(--surface-raised)] font-medium text-[var(--ink)] shadow-[var(--shadow-card)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Nav row — ghost icon-buttons + sentence-case label */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous"
          onClick={navPrev}
          className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--ink-faint)] cursor-pointer-always transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edge-strong)] motion-reduce:transition-none"
        >
          <ChevronLeft size={13} strokeWidth={2} />
        </button>
        <span className="flex-1 truncate text-center text-meta font-medium text-[var(--ink)]">
          {navLabel()}
        </span>
        <button
          type="button"
          aria-label="Next"
          onClick={navNext}
          className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--ink-faint)] cursor-pointer-always transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edge-strong)] motion-reduce:transition-none"
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
