"use client";

/**
 * `TaskOverviewView` — glance-oriented "what do I need to do" home (D-07 /
 * UI-SPEC S-6).
 *
 * A vertical stack of collapsible day-group rows for today + the next 6 days.
 * Each closed row shows a serif day label + a mono count badge; clicking the
 * row HEADER re-scopes the universal day state and drills into kanban via
 * `onSelectDay`. The chevron expands a glass body of that day's `TaskCard`s.
 *
 * Day filtering compares YMD strings directly (`t.dueDate === dayYmd`) — never
 * a `new Date()` round-trip. This is load-bearing: round-tripping introduces
 * UTC-midnight drift in negative-UTC timezones (the same guardrail the kanban
 * day-slice relies on).
 */

import { useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toYmd } from "@/lib/tasks/date-shortcuts";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

interface Props {
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  onSelectDay: (ymd: string) => void;
  /** True while a card is being dragged on the tasks surface — enables the
   * day rows as drop targets and lets them show a cyan drag-over accent. */
  draggingActive?: boolean;
  /** Fired when a dragged card is dropped onto a day row. Parent sets the
   * task's status to "not started"and its due date to that day. */
  onDropDay?: (ymd: string) => void;
}

export function TaskOverviewView({
  tasks,
  onTaskClick,
  onSelectDay,
  draggingActive = false,
  onDropDay,
}: Props) {
  const reduced = useReducedMotion();
  // Which day row a card is currently hovering over during a drag.
  const [dropOverYmd, setDropOverYmd] = useState<string | null>(null);
  // today + next 6 days as YMD strings (string equality, no Date round-trip).
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      return { ymd: toYmd(d), date: d };
    });
  }, []);

  // Per-day open/closed state.
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  function toggleDay(ymd: string) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {days.map(({ ymd, date }) => {
        const dayTasks = tasks.filter((t) => t.dueDate === ymd);
        const isOpen = openDays.has(ymd);
        const isDropOver = dropOverYmd === ymd;
        return (
          <div key={ymd}>
            <div
              onDragOver={(e) => {
                if (!draggingActive) return;
                e.preventDefault();
                setDropOverYmd(ymd);
              }}
              onDragLeave={() => setDropOverYmd((cur) => (cur === ymd ? null : cur))}
              onDrop={(e) => {
                if (!draggingActive) return;
                e.preventDefault();
                setDropOverYmd(null);
                onDropDay?.(ymd);
              }}
              className={cn(
                "flex items-center gap-1 rounded-[6px] transition-shadow",
                isDropOver && "ring-1 ring-[var(--sd-accent)]/50"
              )}
            >
              {/* Day-row header — clicking the label re-scopes the universal
                  day and drills into kanban (S-6). The chevron is a separate
                  hit target for expand/collapse so the two actions don't fight. */}
              <button
                type="button"
                onClick={() => onSelectDay(ymd)}
                className="flex flex-1 items-center justify-between px-4 py-2.5 rounded-[6px] cursor-pointer-always border border-[var(--sd-line)] hover:bg-[var(--sd-hover)] transition-colors duration-[120ms] ease-out text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
              >
                <span className="font-serif text-base text-[var(--sd-ink)]">
                  {format(date, "EEEE, MMMM d")}
                </span>
                {/* Stat-strip numeral (Life OS idiom): quiet when the day is
                    empty, bright + semibold once there's work on it. */}
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    dayTasks.length > 0
                      ? "font-semibold text-[var(--sd-ink)]"
                      : "text-[var(--sd-ink-faint)]"
                  )}
                >
                  {dayTasks.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleDay(ymd)}
                aria-expanded={isOpen}
                aria-label={isOpen ? "Collapse day" : "Expand day"}
                className="p-2 rounded-[6px] cursor-pointer-always text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] transition-colors duration-[120ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
              >
                {isOpen ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  key="body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.16, ease: [0.25, 1, 0.5, 1] }}
                  className="overflow-hidden"
                >
                  <div className="sd-panel p-3 mt-1 mb-2 space-y-1">
                    {dayTasks.length > 0 ? (
                      dayTasks.map((t) => (
                        <TaskCard key={t.id} task={t} onClick={onTaskClick} />
                      ))
                    ) : (
                      <p className="font-serif text-sm italic text-[var(--sd-ink-faint)] px-1 py-0.5">
                        Nothing scheduled.
                      </p>
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
