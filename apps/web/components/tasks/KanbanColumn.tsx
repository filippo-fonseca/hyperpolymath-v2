"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { TaskCard } from "./TaskCard";
import { TaskCreateInline } from "./TaskCreateInline";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

type TaskStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

const STATUS_LABELS: Record<TaskStatus, string> = {
  "not started": "Not Started",
  "up next": "Up Next",
  "in progress": "In Progress",
  "almost done": "Almost Done",
  lesno: "Lesno",
};

const STATUS_ACCENT: Record<
  TaskStatus,
  { dot: string; bg: string; rim: string; cardBg: string }
> = {
  "not started": {
    dot: "oklch(0.72 0.02 80)",
    bg: "oklch(0.21 0.02 80 / 0.55)",
    rim: "oklch(0.42 0.04 80 / 0.6)",
    cardBg: "oklch(0.27 0.03 80 / 0.8)",
  },
  "up next": {
    dot: "oklch(0.78 0.16 80)",
    bg: "oklch(0.22 0.04 75 / 0.75)",
    rim: "oklch(0.55 0.13 75 / 0.6)",
    cardBg: "oklch(0.30 0.07 60 / 0.85)",
  },
  "in progress": {
    dot: "oklch(0.74 0.16 240)",
    bg: "oklch(0.22 0.05 245 / 0.78)",
    rim: "oklch(0.52 0.13 245 / 0.6)",
    cardBg: "oklch(0.30 0.08 260 / 0.85)",
  },
  "almost done": {
    dot: "oklch(0.78 0.16 305)",
    bg: "oklch(0.22 0.05 295 / 0.78)",
    rim: "oklch(0.55 0.13 295 / 0.6)",
    cardBg: "oklch(0.30 0.08 290 / 0.85)",
  },
  lesno: {
    dot: "oklch(0.78 0.18 160)",
    bg: "oklch(0.22 0.05 175 / 0.78)",
    rim: "oklch(0.52 0.12 175 / 0.6)",
    cardBg: "oklch(0.30 0.07 180 / 0.85)",
  },
};

interface Props {
  status: TaskStatus;
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  onCreateTask: (input: { title: string; status: TaskStatus }) => Promise<void>;
  draggedTaskId: string | null;
  draggedFromStatus: TaskStatus | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOnColumn: (target: TaskStatus) => void;
  pendingTaskId: string | null;
}

export function KanbanColumn({
  status,
  tasks,
  onTaskClick,
  onCreateTask,
  draggedTaskId,
  draggedFromStatus,
  onDragStart,
  onDragEnd,
  onDropOnColumn,
  pendingTaskId,
}: Props) {
  const [isOver, setIsOver] = useState(false);
  const accent = STATUS_ACCENT[status];

  const isValidTarget =
    draggedTaskId !== null && draggedFromStatus !== status;
  const showDropAffordance = isOver && isValidTarget;

  return (
    <div
      className="flex flex-col min-w-[280px] max-w-[320px] flex-shrink-0 rounded-2xl"
      data-status={status}
      onDragOver={(e) => {
        if (!draggedTaskId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        if (isValidTarget) onDropOnColumn(status);
      }}
      style={{
        background: accent.bg,
        boxShadow: showDropAffordance
          ? `inset 0 0 0 2px ${accent.dot}, inset 0 0 24px ${accent.rim}`
          : `inset 0 0 0 1px ${accent.rim}`,
        transition: "box-shadow 160ms ease-out",
        ["--task-card-bg" as string]: accent.cardBg,
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: accent.dot }}
        />
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: accent.dot }}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
          ({tasks.length})
        </span>
      </div>

      <div className="flex flex-col gap-2.5 flex-1 px-3 pb-3 min-h-[160px]">
        <AnimatePresence mode="popLayout" initial={false}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick}
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={draggedTaskId === task.id}
              isPending={pendingTaskId === task.id}
            />
          ))}
        </AnimatePresence>

        <div className="mt-1">
          <TaskCreateInline status={status} onCreateTask={onCreateTask} />
        </div>
      </div>
    </div>
  );
}
