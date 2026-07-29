"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listActivitiesInRange } from "@/app/actions/training";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ActivityWithType } from "@/lib/db/queries/training";
import { cn } from "@/lib/utils";
import { TypeIcon } from "./TypeIcon";
import { typeFill } from "./type-color";

interface Props {
  userId: string;
  /** ISO of any day in the month to start on (controlled by parent). */
  anchorISO: string;
  onAnchorChange: (iso: string) => void;
  /** Click a day to jump back to the week view focused on it. */
  onDayClick?: (iso: string) => void;
}

const MAX_CHIPS = 3;

function toISO(d: Date): string {
  // Build an ISO date in local time (avoid UTC drift across DST).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Full-month grid (Mon-first, 6 rows × 7 cols). Each day cell stacks up to
 * MAX_CHIPS activity chips plus a "+N" overflow indicator. Click a day to
 * jump back to the week view.
 */
export function TrainingMonthView({
  userId,
  anchorISO,
  onAnchorChange,
  onDayClick,
}: Props) {
  const anchor = useMemo(() => parseISO(anchorISO), [anchorISO]);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
    [anchor],
  );
  const gridEnd = useMemo(
    () => endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }),
    [anchor],
  );

  const startISO = toISO(gridStart);
  const endISO = toISO(gridEnd);

  const { data: activities = [] } = useQuery<ActivityWithType[]>({
    queryKey: ["training_activities", userId, startISO, endISO] as const,
    queryFn: () => listActivitiesInRange(startISO, endISO),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, ActivityWithType[]>();
    for (const a of activities) {
      const arr = m.get(a.scheduledDate);
      if (arr) arr.push(a);
      else m.set(a.scheduledDate, [a]);
    }
    return m;
  }, [activities]);

  const days = useMemo(() => {
    const out: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  const today = new Date();
  const monthLabel = format(anchor, "MMMM");
  const yearLabel = format(anchor, "yyyy");

  function shiftMonth(delta: number) {
    onAnchorChange(toISO(addMonths(anchor, delta)));
  }

  function setMonth(monthIdx: number) {
    const next = new Date(anchor.getFullYear(), monthIdx, 1);
    onAnchorChange(toISO(next));
  }

  function setYear(year: number) {
    const next = new Date(year, anchor.getMonth(), 1);
    onAnchorChange(toISO(next));
    setYearPickerOpen(false);
  }

  const thisYear = today.getFullYear();
  const yearChoices = useMemo(() => {
    const center = anchor.getFullYear();
    const out: number[] = [];
    for (let y = center - 6; y <= center + 6; y++) out.push(y);
    return out;
  }, [anchor]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Sub-header — month/year nav */}
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 font-mono text-[11px] uppercase tracking-[0.06em]"
            onClick={() => onAnchorChange(toISO(today))}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </Button>
        </div>

        <Popover open={yearPickerOpen} onOpenChange={setYearPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded-[6px] px-2 py-1 text-base font-semibold tracking-[-0.01em] text-[var(--sd-ink)] transition-colors duration-150 hover:bg-[var(--sd-hover)]"
            >
              <span className="mr-2">{monthLabel}</span>
              <span className="font-mono text-sm tracking-[0.04em] text-[var(--sd-ink-dull)]">
                {yearLabel}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="flex w-[260px] flex-col gap-3 p-3"
            align="end"
          >
            <div className="flex flex-col gap-1.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
                Month
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "May",
                  "Jun",
                  "Jul",
                  "Aug",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dec",
                ].map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonth(i)}
                    className={cn(
                      "rounded border px-2 py-1 font-mono text-[11px] uppercase",
                      anchor.getMonth() === i
                        ? "border-[var(--sd-line)] bg-[var(--sd-selected)] text-[var(--sd-ink)]"
                        : "border-[var(--sd-line)] text-[var(--sd-ink-dull)] hover:border-[var(--sd-accent)] hover:text-[var(--sd-ink)]",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
                Year
              </div>
              <div className="grid grid-cols-4 gap-1">
                {yearChoices.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYear(y)}
                    className={cn(
                      "rounded border px-2 py-1 font-mono text-[11px]",
                      anchor.getFullYear() === y
                        ? "border-[var(--sd-line)] bg-[var(--sd-selected)] text-[var(--sd-ink)]"
                        : "border-[var(--sd-line)] text-[var(--sd-ink-dull)] hover:border-[var(--sd-accent)] hover:text-[var(--sd-ink)]",
                      y === thisYear &&
                        anchor.getFullYear() !== y &&
                        "italic",
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-[var(--edge)] pb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-2xl border border-[var(--edge)] bg-[var(--edge)] shadow-[var(--shadow-card)]">
        {days.map((d) => {
          const iso = toISO(d);
          const inMonth = isSameMonth(d, anchor);
          const isToday = isSameDay(d, today);
          const acts = byDay.get(iso) ?? [];
          const extra = Math.max(0, acts.length - MAX_CHIPS);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayClick?.(iso)}
              className={cn(
                "flex flex-col gap-1 bg-[var(--surface-raised)] p-1.5 text-left transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]",
                !inMonth && "opacity-40",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums tracking-[0.04em]",
                    isToday
                      ? "rounded-full bg-[var(--sd-ink)] px-1.5 text-[var(--sd-app)]"
                      : "text-[var(--sd-ink-dull)]",
                  )}
                >
                  {d.getDate()}
                </span>
                {acts.length > 0 ? (
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
                    {acts.length}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-0.5">
                {acts.slice(0, MAX_CHIPS).map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                      a.status === "done" && "line-through opacity-75",
                      a.status === "cancelled" && "line-through opacity-50",
                      a.status === "skipped" && "italic opacity-60",
                    )}
                    // Same softening as every other training surface, so the
                    // month grid can never drift from the card register.
                    style={{
                      backgroundColor: typeFill(a.type.color),
                      color: "var(--sd-ink)",
                    }}
                    title={a.title}
                  >
                    {a.type.icon ? (
                      <TypeIcon
                        name={a.type.icon}
                        size={9}
                        color={a.type.color}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: a.type.color }}
                      />
                    )}
                    <span className="truncate">{a.title}</span>
                  </div>
                ))}
                {extra > 0 ? (
                  <div className="px-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
                    +{extra} more
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
