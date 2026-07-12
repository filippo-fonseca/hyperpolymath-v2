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

import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { toYmd } from "@/lib/tasks/date-shortcuts";
import { cn } from "@/lib/utils";
import { addDays, format, startOfDay } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { TaskCard } from "./TaskCard";

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
  const reducedMotion = useReducedMotion() ?? false;
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
                "flex items-center gap-1 rounded-lg transition-shadow",
                isDropOver &&
                  "ring-1 ring-[var(--hud-cyan)]/40 [--glass-glow-color:var(--hud-cyan)]"
              )}
            >
              {/* Day-row header — clicking the label re-scopes the universal
                  day and drills into kanban (S-6). The chevron is a separate
                  hit target for expand/collapse so the two actions don't fight. */}
              <button
                type="button"
                onClick={() => onSelectDay(ymd)}
                className="flex min-h-10 flex-1 items-center justify-between rounded-[0.375rem] border border-[var(--deck-line)] px-3 py-2 text-left cursor-pointer-always transition-colors duration-[var(--dur-hover)] hover:border-[var(--deck-accent)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
              >
                <span className="font-[family-name:var(--font-sans)] text-[13px] text-[var(--deck-ink)]">
                  {format(date, "EEEE, MMMM d")}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--deck-ink-dull)] tabular-nums">
                  {dayTasks.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleDay(ymd)}
                aria-expanded={isOpen}
                aria-label={isOpen ? "Collapse day" : "Expand day"}
                className="min-h-10 min-w-10 rounded-[0.375rem] p-2 cursor-pointer-always text-[var(--deck-ink-dull)] transition-colors duration-[var(--dur-hover)] hover:bg-[var(--deck-hover)] hover:text-[var(--deck-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>

            <AnimatePresence initial={!reducedMotion}>
              {isOpen ? (
                <motion.div
                  key="body"
                  initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.25, 1, 0.5, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 mb-2 space-y-1 rounded-[0.5rem] border border-[var(--deck-line)] bg-[var(--deck-panel-deep)] p-2">
                    {dayTasks.length > 0 ? (
                      dayTasks.map((t) => <TaskCard key={t.id} task={t} onClick={onTaskClick} />)
                    ) : (
                      <p className="px-1 py-1 font-[family-name:var(--font-sans)] text-[12px] text-[var(--deck-ink-dull)]">
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
