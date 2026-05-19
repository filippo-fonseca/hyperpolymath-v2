"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { PriorityChip } from "./PriorityChip";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

interface Props {
  task: TaskWithProjects;
  onClick: (id: string) => void;
  isDragging?: boolean;
  isPending?: boolean;
}

/**
 * Pure display card used both inside SortableTaskCard and inside DragOverlay.
 */
export function TaskCard({ task, onClick, isDragging, isPending }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue =
    task.dueDate !== null &&
    task.status !== "lesno" &&
    new Date(task.dueDate) < today;
  const isLesno = task.status === "lesno";

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer select-none",
        "shadow-[0_1px_2px_hsl(30,10%,50%,0.08)]",
        "hover:border-border/80 hover:shadow-[0_2px_6px_hsl(30,10%,50%,0.12)]",
        "transition-all",
        isDragging &&
          "shadow-[0_8px_32px_hsl(30,10%,50%,0.20)] scale-[1.02] border-ring opacity-95",
        isPending && "opacity-50",
        isLesno && "opacity-60",
      )}
      onClick={() => onClick(task.id)}
    >
      {/* Title */}
      <p
        className={cn(
          "font-serif text-base text-foreground line-clamp-2 mb-2",
          isLesno && "line-through",
        )}
      >
        {task.title}
      </p>

      {/* Bottom row: priority + due date + project */}
      <div className="flex items-center justify-between gap-2">
        <PriorityChip priority={task.priority} />
        <div className="flex items-center gap-2 min-w-0">
          {task.dueDate && (
            <span
              className={cn(
                "font-sans text-[13px] shrink-0",
                isOverdue ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.projects.length > 0 && (
            <span className="font-sans text-[13px] text-muted-foreground truncate">
              {task.projects[0]!.name}
              {task.projects.length > 1 && ` +${task.projects.length - 1}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sortable wrapper — use inside KanbanColumn's SortableContext.
 */
export function SortableTaskCard({
  task,
  onClick,
  activeId,
  isPending,
}: {
  task: TaskWithProjects;
  onClick: (id: string) => void;
  activeId: string | null;
  isPending: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        // Phase 6 Plan 06-05 (UI-SPEC §10 / D-09): the whole sortable wrapper
        // is BOTH the drag target (dnd-kit listeners attach here) and the
        // click-to-open surface (TaskCard's onClick bubbles up). Drag intent
        // supersedes click intent visually — cursor-grab at rest, grabbing
        // while pressed. The inner TaskCard keeps its own cursor-pointer
        // for completeness, but this wrapper's cursor wins because it's on top.
        "touch-none cursor-grab active:cursor-grabbing",
        isSortableDragging && "opacity-0",
      )}
    >
      <TaskCard
        task={task}
        onClick={onClick}
        isDragging={false}
        isPending={isPending && activeId === task.id}
      />
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
