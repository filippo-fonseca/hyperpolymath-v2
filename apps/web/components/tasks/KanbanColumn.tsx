"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { SortableTaskCard } from "./TaskCard";
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

/**
 * Arc-redesign: per-status accent colours for the glossier kanban look.
 * Each column gets a faint tinted gradient + dot indicator. Cyan stays the
 * primary JARVIS register; the other tints are siblings, not replacements.
 */
const STATUS_ACCENT: Record<
  TaskStatus,
  { dot: string; tint: string; rim: string; glow: string }
> = {
  "not started": {
    dot: "var(--ink-muted)",
    tint: "color-mix(in oklch, var(--ink-muted) 8%, transparent)",
    rim: "color-mix(in oklch, var(--edge) 70%, transparent)",
    glow: "color-mix(in oklch, var(--ink-muted) 14%, transparent)",
  },
  "up next": {
    dot: "var(--ink-amber)",
    tint: "color-mix(in oklch, var(--ink-amber) 10%, transparent)",
    rim: "color-mix(in oklch, var(--ink-amber) 40%, transparent)",
    glow: "color-mix(in oklch, var(--ink-amber) 22%, transparent)",
  },
  "in progress": {
    dot: "var(--hud-cyan)",
    tint: "color-mix(in oklch, var(--hud-cyan) 10%, transparent)",
    rim: "color-mix(in oklch, var(--hud-cyan) 40%, transparent)",
    glow: "color-mix(in oklch, var(--hud-cyan) 22%, transparent)",
  },
  "almost done": {
    dot: "oklch(0.65 0.18 295)",
    tint: "color-mix(in oklch, oklch(0.65 0.18 295) 10%, transparent)",
    rim: "color-mix(in oklch, oklch(0.65 0.18 295) 40%, transparent)",
    glow: "color-mix(in oklch, oklch(0.65 0.18 295) 22%, transparent)",
  },
  lesno: {
    dot: "var(--ink-sage)",
    tint: "color-mix(in oklch, var(--ink-sage) 10%, transparent)",
    rim: "color-mix(in oklch, var(--ink-sage) 40%, transparent)",
    glow: "color-mix(in oklch, var(--ink-sage) 22%, transparent)",
  },
};

interface Props {
  status: TaskStatus;
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  onCreateTask: (input: { title: string; status: TaskStatus }) => Promise<void>;
  activeId: string | null;
  pendingTaskId: string | null;
}

export function KanbanColumn({
  status,
  tasks,
  onTaskClick,
  onCreateTask,
  activeId,
  pendingTaskId,
}: Props) {
  // Column itself is a droppable so empty columns are valid drop targets
  const droppableId = `column:${status}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  const accent = STATUS_ACCENT[status];
  const activeDrop = isOver && activeId;

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-shrink-0">
      {/* Column header — small dot + label + count, sticky to scroll. */}
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-10 bg-[var(--canvas)]/85 backdrop-blur-sm">
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{
            backgroundColor: accent.dot,
            boxShadow: `0 0 8px ${accent.glow}`,
          }}
        />
        <span className="font-serif text-sm font-semibold tracking-tight text-[var(--ink)]">
          {STATUS_LABELS[status]}
        </span>
        <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
          {tasks.length}
        </span>
      </div>

      {/* Drop zone — status-tinted gradient + soft inset border. Pulses
          inward when a card is hovering over it (activeDrop). */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2.5 flex-1 p-3 rounded-2xl min-h-[160px]",
          "transition-all duration-200 ease-out",
        )}
        style={{
          background: `linear-gradient(180deg, ${accent.tint} 0%, color-mix(in oklch, var(--surface) 92%, transparent) 70%)`,
          boxShadow: activeDrop
            ? `inset 0 0 0 2px ${accent.rim}, 0 0 32px ${accent.glow}`
            : `inset 0 0 0 1px ${accent.rim}, 0 1px 2px rgba(0,0,0,0.05)`,
        }}
      >
        <SortableContext
          id={`kanban-column-${status}`}
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onClick={onTaskClick}
                activeId={activeId}
                isPending={pendingTaskId === task.id}
              />
            ))}
          </AnimatePresence>
        </SortableContext>

        {/* Add task at column footer */}
        <div className="mt-1">
          <TaskCreateInline status={status} onCreateTask={onCreateTask} />
        </div>
      </div>
    </div>
  );
}
