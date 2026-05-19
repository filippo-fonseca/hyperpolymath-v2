"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
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
 * Phase 06.1 Plan 04 (UI-SPEC §5h, §7c) — document-tier Kanban task card.
 *
 * Visual register:
 *  - bg --surface + 1px --edge border + rounded-md (no neumorphic shadow)
 *  - lesno: 4px --ink-sage left edge + line-through + 70% opacity
 *
 * Motion (Motion 12 / motion/react):
 *  - whileHover lifts the card translateY(-4px) and switches the shadow to a
 *    soft ambient drop over 150ms --ease-out-quart. This is the single
 *    grep-verifiable "felt-quality" beat the UI-SPEC mandates for /tasks.
 *  - hover lift is skipped when the card IS the drag preview (isDragging=true).
 *  - `layout` keeps reorders inside KanbanColumn's AnimatePresence frame.
 *
 * Pure display surface — drag wiring lives in SortableTaskCard below so dnd-kit
 * listeners stay on a separate, semantically-correct grab handle.
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
    <motion.div
      layout
      whileHover={
        isDragging
          ? undefined
          : { y: -4, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }
      }
      transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
      className={cn(
        "rounded-md border border-[var(--edge)] bg-[var(--surface)]",
        "px-3 py-2 cursor-pointer select-none",
        isDragging && "opacity-95",
        isPending && "opacity-50",
        isLesno && "border-l-4 border-l-[var(--ink-sage)] opacity-70",
      )}
      onClick={() => onClick(task.id)}
    >
      {/* Title */}
      <p
        className={cn(
          "font-serif text-base line-clamp-2 mb-2",
          isLesno
            ? "line-through text-[var(--ink-muted)]"
            : "text-[var(--ink)]",
        )}
      >
        {task.title}
      </p>

      {/* Bottom row: priority + due date + project — mono metadata register */}
      <div className="flex items-center justify-between gap-2">
        <PriorityChip priority={task.priority} />
        <div className="flex items-center gap-2 min-w-0">
          {task.dueDate && (
            <span
              className={cn(
                "font-mono text-xs shrink-0",
                isOverdue
                  ? "text-[var(--ink-coral)]"
                  : "text-[var(--ink-muted)]",
              )}
            >
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.projects.length > 0 && (
            <span className="font-mono text-xs text-[var(--ink-muted)] truncate">
              {task.projects[0]!.name}
              {task.projects.length > 1 && ` +${task.projects.length - 1}`}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Sortable wrapper — use inside KanbanColumn's SortableContext.
 * Drag listeners attach to the OUTER wrapper (cursor-grab); the inner TaskCard
 * keeps its own cursor-pointer + motion hover lift.
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
        // click-to-open surface. Drag intent wins visually via cursor-grab.
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
