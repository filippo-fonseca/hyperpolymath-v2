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

/**
 * Phase 06.1 Plan 04 (UI-SPEC §5h, §7c): column headers carry mono
 * uppercase chrome. Status labels in --ink-muted, count chip flat (no pill).
 * No per-status background tint — keeps document surface calm.
 */
const STATUS_LABELS: Record<TaskStatus, string> = {
  "not started": "Not Started",
  "up next": "Up Next",
  "in progress": "In Progress",
  "almost done": "Almost Done",
  lesno: "Lesno",
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

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-shrink-0">
      {/* Column header — mono uppercase chrome per UI-SPEC §5h */}
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-10 bg-[var(--canvas)]">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          {STATUS_LABELS[status]}
        </span>
        <span className="font-mono text-[11px] text-[var(--ink-muted)]">
          {tasks.length}
        </span>
      </div>

      {/* Drop zone — bg --surface tile with 1px --edge border */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2 flex-1 p-2 rounded-md min-h-[120px]",
          "border border-[var(--edge)] bg-[var(--surface)]",
          "transition-colors duration-150 ease-out",
          // Drop highlight: deepen border + soft surface-raised tint when hovering an active drag
          isOver && activeId
            ? "border-[var(--edge-hud)] bg-[var(--surface-raised)]"
            : null,
        )}
      >
        <SortableContext
          id={`kanban-column-${status}`}
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {/* AnimatePresence drives TaskCard reorder + exit choreography per
              UI-SPEC §7c (layout animation on reorder, exit on cross-column move
              or delete). `mode="popLayout"` lets sibling cards reflow while a
              card exits. */}
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
