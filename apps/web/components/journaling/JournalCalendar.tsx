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
import { useEffect, useState } from "react";
import type { JournalEntry } from "@/app/actions/journal";
import { cn } from "@/lib/utils";

type ViewMode = "week" | "month" | "year";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface Props {
  selectedDate: string;
  entries: JournalEntry[];
  onSelectDate: (date: string) => void;
}

export function JournalCalendar({ selectedDate, entries, onSelectDate }: Props) {
  const selected = parseISO(selectedDate);
  const [viewDate, setViewDate] = useState<Date>(selected);
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  // When the arrows in the editor header flip the day, snap the calendar
  // to show the new date's month/week so the highlight stays visible.
  useEffect(() => {
    setViewDate(parseISO(selectedDate));
  }, [selectedDate]);

  const entryDates = new Set(entries.map((e) => e.date));

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
    if (viewMode === "month") return format(viewDate, "MMMM yyyy");
    if (viewMode === "week") {
      const s = startOfWeek(viewDate);
      const e = endOfWeek(viewDate);
      if (format(s, "MMM yyyy") === format(e, "MMM yyyy")) {
        return `${format(s, "MMM d")} – ${format(e, "d, yyyy")}`;
      }
      return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
    }
    return format(viewDate, "yyyy");
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
        <div className="grid grid-cols-7 mb-1">
          {DOW.map((d) => (
            <div
              key={d}
              className="text-center font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-muted)] py-1"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
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
                className={cn(
                  "relative flex flex-col items-center justify-center h-8 w-full rounded-md text-[12px] transition-all duration-150",
                  !inMonth && "opacity-20 pointer-events-none",
                  inMonth && !isSelected && "text-[var(--ink)] hover:bg-[var(--surface-raised)]",
                  isCurrDay && !isSelected && "font-semibold text-[var(--hud-cyan)]",
                  isSelected &&
                    "glass-pressed bg-[var(--surface)] text-[var(--hud-cyan)] font-semibold",
                )}
              >
                <span>{format(day, "d")}</span>
                {hasEntry && !isSelected && (
                  <span
                    className={cn(
                      "absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[3px] w-[3px] rounded-full",
                      isCurrDay
                        ? "bg-[var(--hud-cyan)] opacity-80"
                        : "bg-[var(--ink-muted)] opacity-50",
                    )}
                  />
                )}
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
      <div className="grid grid-cols-7 gap-1">
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
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 h-14 w-full rounded-lg text-[12px] transition-all duration-150",
                !isSelected && "text-[var(--ink)] hover:bg-[var(--surface-raised)]",
                isCurrDay && !isSelected && "text-[var(--hud-cyan)] font-semibold",
                isSelected &&
                  "glass-pressed bg-[var(--surface)] text-[var(--hud-cyan)] font-semibold",
              )}
            >
              <span className="font-mono text-[8px] text-[var(--ink-muted)] uppercase tracking-wider">
                {format(day, "EEE")}
              </span>
              <span>{format(day, "d")}</span>
              {hasEntry && !isSelected && (
                <span className="h-[3px] w-[3px] rounded-full bg-[var(--ink-muted)] opacity-50" />
              )}
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
      <div className="grid grid-cols-3 gap-1.5">
        {MONTH_NAMES.map((name, i) => {
          const monthDate = new Date(yr, i, 1);
          const isCurrentMonth = isSameMonth(monthDate, new Date());
          const isSelectedMonth = isSameMonth(monthDate, selected);
          const prefix = `${yr}-${String(i + 1).padStart(2, "0")}`;
          const count = entries.filter((e) => e.date.startsWith(prefix)).length;

          return (
            <button
              key={name}
              type="button"
              onClick={() => {
                setViewDate(monthDate);
                setViewMode("month");
              }}
              className={cn(
                "rounded-xl px-2 py-3 flex flex-col items-center gap-1 transition-all duration-150",
                !isSelectedMonth && "text-[var(--ink)] hover:bg-[var(--surface-raised)]",
                isCurrentMonth && !isSelectedMonth && "text-[var(--hud-cyan)] font-semibold",
                isSelectedMonth &&
                  "glass-pressed bg-[var(--surface)] text-[var(--hud-cyan)] font-semibold",
              )}
            >
              <span className="text-[13px]">{name}</span>
              {count > 0 && (
                <span className="font-mono text-[8px] text-[var(--ink-muted)]">
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
      className="glass-tile rounded-2xl p-4 flex flex-col gap-3 self-start sticky top-4"
      aria-label="Journal calendar"
    >
      {/* View mode switcher */}
      <div className="flex items-center justify-center gap-1 pb-1 border-b border-[var(--edge)]">
        {(["week", "month", "year"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={cn(
              "px-2.5 py-0.5 rounded-full font-mono text-[9.5px] uppercase tracking-[0.07em] transition-all duration-150",
              viewMode === mode
                ? "glass-pressed bg-[var(--surface)] text-[var(--hud-cyan)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
            )}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Month / week / year nav row */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous"
          onClick={navPrev}
          className="glass-button h-6 w-6 inline-flex items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <ChevronLeft size={12} strokeWidth={2} />
        </button>
        <span className="font-serif text-[12.5px] text-[var(--ink)] font-medium text-center flex-1 truncate">
          {navLabel()}
        </span>
        <button
          type="button"
          aria-label="Next"
          onClick={navNext}
          className="glass-button h-6 w-6 inline-flex items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <ChevronRight size={12} strokeWidth={2} />
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
