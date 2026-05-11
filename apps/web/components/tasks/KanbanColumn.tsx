"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
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

// Per UI-SPEC §Status Color Map — muted column header tints
const COLUMN_STYLE: Record<TaskStatus, string> = {
  "not started": "",
  "up next": "bg-[hsl(215,15%,95%)]",
  "in progress": "bg-[hsl(35,25%,93%)]",
  "almost done": "bg-[hsl(155,18%,93%)]",
  lesno: "bg-[hsl(145,20%,90%)]",
};

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
  // Per plan: column itself is a droppable so empty columns are valid drop targets
  const droppableId = `column:${status}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-shrink-0">
      {/* Column header — sticky */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-t-md sticky top-0 z-10",
          COLUMN_STYLE[status],
        )}
      >
        <span className="font-sans text-[13px] tracking-[0.08em] uppercase text-muted-foreground">
          {STATUS_LABELS[status]}
        </span>
        <span className="font-sans text-[13px] bg-secondary text-muted-foreground px-2 rounded-full">
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2 flex-1 p-2 rounded-b-md min-h-[120px]",
          "border border-border border-t-0",
          isOver && activeId && "bg-secondary/40",
          "transition-colors",
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick}
              activeId={activeId}
              isPending={pendingTaskId === task.id}
            />
          ))}
        </SortableContext>

        {/* Add task at column footer */}
        <div className="mt-1">
          <TaskCreateInline status={status} onCreateTask={onCreateTask} />
        </div>
      </div>
    </div>
  );
}
