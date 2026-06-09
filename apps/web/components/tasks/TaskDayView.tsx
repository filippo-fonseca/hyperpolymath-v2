"use client";

/**
 * `TaskDayView` — date-anchored tasks list.
 *
 * Shows tasks grouped around a selected day. Prev/next arrows shift the
 * anchor by one day; "Today" snaps back. When the anchor is today, an
 * "Overdue" section surfaces all open past-due tasks at the top and a
 * "No due date" section catches dateless ones at the bottom.
 *
 * Drag affordances are intentionally absent here — this view is for
 * planning/reading, not status flips. Click a card to open its detail panel.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  format,
  isBefore,
  isSameDay,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { TaskCard } from "./TaskCard";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

interface Props {
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
}

export function TaskDayView({ tasks, onTaskClick }: Props) {
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const today = startOfDay(new Date());
  const isViewingToday = isSameDay(date, today);

  const overdueTasks = isViewingToday
    ? tasks.filter((t) => {
        if (t.status === "lesno" || !t.dueDate) return false;
        return isBefore(startOfDay(new Date(t.dueDate)), today);
      })
    : [];

  const dayTasks = tasks.filter(
    (t) => t.dueDate && isSameDay(new Date(t.dueDate), date),
  );

  const noDateTasks = isViewingToday
    ? tasks.filter((t) => t.dueDate === null && t.status !== "lesno")
    : [];

  const dateLabel = isToday(date)
    ? `Today · ${format(date, "EEE, MMM d")}`
    : isTomorrow(date)
      ? `Tomorrow · ${format(date, "EEE, MMM d")}`
      : isYesterday(date)
        ? `Yesterday · ${format(date, "EEE, MMM d")}`
        : format(date, "EEEE, MMMM d");

  return (
    <div className="flex flex-col">
      {/* Sticky date-nav header — pins to the top of the page's scroll context
          as the user scrolls through long task sections. */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 py-3 -mt-1 mb-2"
        style={{
          background:
            "linear-gradient(to bottom, var(--canvas) 80%, transparent)",
        }}
      >
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setDate(addDays(date, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setDate(addDays(date, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 ml-1 font-sans text-[12px]"
            onClick={() => setDate(today)}
            disabled={isViewingToday}
          >
            Today
          </Button>
        </div>
        <h2 className="font-serif text-xl text-[var(--ink)] tracking-tight">
          {dateLabel}
        </h2>
      </div>

      <div className="pb-6">
        {overdueTasks.length > 0 && (
          <DaySection
            title="Overdue"
            color="var(--ink-coral)"
            tasks={overdueTasks}
            onTaskClick={onTaskClick}
          />
        )}
        <DaySection
          title={isViewingToday ? "Today" : dateLabel}
          tasks={dayTasks}
          onTaskClick={onTaskClick}
          emptyText="Nothing scheduled for this day."
        />
        {noDateTasks.length > 0 && (
          <DaySection
            title="No due date"
            tasks={noDateTasks}
            onTaskClick={onTaskClick}
          />
        )}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  color?: string;
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  emptyText?: string;
}

function DaySection({
  title,
  color,
  tasks,
  onTaskClick,
  emptyText,
}: SectionProps) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: color ?? "var(--ink-muted)" }}
        >
          {title}
        </span>
        <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
          ({tasks.length})
        </span>
      </div>
      {tasks.length > 0 ? (
        <div className="grid grid-cols-1 @sm/main:grid-cols-2 @2xl/main:grid-cols-3 @4xl/main:grid-cols-4 gap-2.5">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onClick={onTaskClick} />
          ))}
        </div>
      ) : emptyText ? (
        <p className="font-serif text-[var(--ink-muted)] text-sm italic">
          {emptyText}
        </p>
      ) : null}
    </section>
  );
}
