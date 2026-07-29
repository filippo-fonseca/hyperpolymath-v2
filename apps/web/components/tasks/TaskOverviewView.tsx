"use client";

/**
 * `TaskOverviewView` — glance-oriented "what do I need to do" home.
 *
 * A vertical stack of collapsible day-group rows for today + the next 6 days.
 * Each closed row shows the day label + a count; clicking the row re-scopes
 * the universal day state and drills into the board via `onSelectDay`. The
 * chevron expands that day's cards.
 *
 * Day filtering compares YMD strings directly (`t.dueDate === dayYmd`), never
 * a `new Date()` round-trip. This is load-bearing: round-tripping introduces
 * UTC-midnight drift in negative-UTC timezones (the same guardrail the kanban
 * day-slice relies on). The per-day buckets are computed ONCE per tasks
 * identity, not re-filtered inside the row map.
 *
 * Drag-over affordance writes straight to the DOM (no React state on
 * dragover; a state write there re-renders all seven rows per frame).
 */

import { useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toYmd } from "@/lib/tasks/date-shortcuts";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

interface Props {
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  onSelectDay: (ymd: string) => void;
  /** True while a card is being dragged on the tasks surface — enables the
   * day rows as drop targets. */
  draggingActive?: boolean;
  /** Fired when a dragged card is dropped onto a day row. Parent sets the
   * task's status to "not started" and its due date to that day. */
  onDropDay?: (ymd: string) => void;
}

const DROP_RING = "inset 0 0 0 1px var(--accent)";

export function TaskOverviewView({
  tasks,
  onTaskClick,
  onSelectDay,
  draggingActive = false,
  onDropDay,
}: Props) {
  // today + next 6 days as YMD strings (string equality, no Date round-trip).
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      return { ymd: toYmd(d), date: d };
    });
  }, []);

  // One pass over tasks per identity change; the row map only reads buckets.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskWithProjects[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const bucket = map.get(t.dueDate);
      if (bucket) bucket.push(t);
      else map.set(t.dueDate, [t]);
    }
    return map;
  }, [tasks]);

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
        const dayTasks = tasksByDay.get(ymd) ?? [];
        const isOpen = openDays.has(ymd);
        return (
          <div key={ymd}>
            <div
              onDragOver={(e) => {
                if (!draggingActive) return;
                e.preventDefault();
                e.currentTarget.style.boxShadow = DROP_RING;
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
              }}
              onDrop={(e) => {
                if (!draggingActive) return;
                e.preventDefault();
                e.currentTarget.style.boxShadow = "none";
                onDropDay?.(ymd);
              }}
              className="flex items-center gap-1 rounded-lg"
            >
              {/* Day-row header: clicking the label re-scopes the universal
                  day and drills into the board. The chevron is a separate hit
                  target for expand/collapse so the two actions don't fight. */}
              <button
                type="button"
                onClick={() => onSelectDay(ymd)}
                className={cn(
                  "flex h-11 flex-1 items-center justify-between rounded-lg px-4 text-left cursor-pointer-always",
                  "transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
                )}
              >
                <span className="text-body font-medium text-[var(--ink)]">
                  {format(date, "EEEE, MMMM d")}
                </span>
                <span
                  className={cn(
                    "text-micro tabular-nums",
                    dayTasks.length > 0
                      ? "font-medium text-[var(--ink)]"
                      : "text-[var(--ink-faint)]"
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
                className={cn(
                  "rounded-lg p-2 text-[var(--ink-muted)] cursor-pointer-always",
                  "transition-colors duration-[160ms] ease-out",
                  "hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                )}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>

            {isOpen ? (
              <div className="mt-1 mb-2 flex flex-col gap-2 rounded-xl bg-[var(--surface)] p-3">
                {dayTasks.length > 0 ? (
                  dayTasks.map((t) => <TaskCard key={t.id} task={t} onClick={onTaskClick} />)
                ) : (
                  <p className="px-1 py-0.5 text-meta text-[var(--ink-faint)]">
                    Nothing scheduled.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
