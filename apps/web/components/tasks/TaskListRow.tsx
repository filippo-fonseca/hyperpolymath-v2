"use client";

import { useState, useRef, useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { GripVertical, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { PriorityChip } from "./PriorityChip";
import { updateTask, updateTaskStatus } from "@/app/actions/tasks";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { TasksOptimisticDispatch } from "./TasksClient";

type Status =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

const STATUS_LABELS: Record<Status, string> = {
  "not started": "Not Started",
  "up next": "Up Next",
  "in progress": "In Progress",
  "almost done": "Almost Done",
  lesno: "Lesno",
};

interface Props {
  task: TaskWithProjects;
  onRowClick: (id: string) => void;
  addOptimistic: TasksOptimisticDispatch;
}

/**
 * Phase 06.1 Plan 04 (UI-SPEC §5h, §7c) — document-tier task list row.
 *
 * Visual register:
 *  - bg --canvas (no card chrome)
 *  - 1px transparent left edge at rest; 1px --edge left edge on hover
 *    (fades over 150ms — felt-quality mandate)
 *  - lesno state: 2px --ink-sage persistent left edge + line-through + 70% opacity
 *  - Title in font-serif --ink (or --ink-muted line-through when lesno)
 *  - PriorityChip uses the amber opacity ladder + Infinity icon (no pills)
 *  - Status + Due in mono metadata register, --ink-muted
 *
 * Motion (Motion 12 / motion/react):
 *  - `layout` prop drives reorder choreography (--ease-out-quart over 280ms)
 *  - Enter: fade-in + 4px Y-translate over 220ms --ease-out-quart
 *  - Exit: opacity → 0, height → 0 over 200ms (TasksClient must wrap the mapped
 *    rows in `<AnimatePresence mode="popLayout">` for exit to fire on delete)
 *
 * The motion wrapper is ALSO the dnd-kit sortable node (single div serves both
 * concerns). dnd-kit's `transform` is applied via style; motion's layout takes
 * over once dragging ends. No double-wrap to keep markup flat.
 */
export function TaskListRow({ task, onRowClick, addOptimistic }: Props) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue =
    task.dueDate !== null &&
    task.status !== "lesno" &&
    new Date(task.dueDate) < today;
  const isLesno = task.status === "lesno";

  function startEditTitle(e: React.MouseEvent) {
    e.stopPropagation();
    setIsEditingTitle(true);
    setEditTitle(task.title);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitTitle() {
    const trimmed = editTitle.trim();
    setIsEditingTitle(false);
    if (trimmed && trimmed !== task.title) {
      startTransition(async () => {
        addOptimistic({ type: "update", id: task.id, patch: { title: trimmed } });
        const r = await updateTask({ id: task.id, title: trimmed });
        if (!r.success) {
          toast.error(r.error);
        }
      });
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitTitle();
    if (e.key === "Escape") {
      setIsEditingTitle(false);
      setEditTitle(task.title);
    }
  }

  function toggleLesno(e: React.MouseEvent) {
    e.stopPropagation();
    const newStatus: Status = isLesno ? "not started" : "lesno";
    startTransition(async () => {
      addOptimistic({
        type: "update",
        id: task.id,
        patch: { status: newStatus },
      });
      const r = await updateTaskStatus({ id: task.id, newStatus });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      if (r.data.becameLesno) toast("Lesno.");
    });
  }

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
      style={dndStyle}
      className={cn(
        // Flat row on --canvas — no card chrome.
        "group flex items-center gap-2 h-10 px-2 cursor-pointer",
        // Hover left edge accent (felt-quality grep target: hover:border-l-[var(--edge)])
        "border-l-2 transition-colors duration-150 ease-out",
        isLesno
          ? "border-l-[var(--ink-sage)] opacity-70"
          : "border-l-transparent hover:border-l-[var(--edge)]",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        onPointerDown={(e) => {
          listeners?.onPointerDown?.(e);
        }}
      >
        <GripVertical size={14} />
      </button>

      {/* Lesno checkbox — sage fill when checked */}
      <button
        type="button"
        onClick={toggleLesno}
        className={cn(
          "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors duration-150 ease-out",
          isLesno
            ? "bg-[var(--ink-sage)] border-[var(--ink-sage)]"
            : "border-[var(--edge)]",
        )}
        aria-label={isLesno ? "Mark incomplete" : "Mark complete"}
      >
        {isLesno && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{ color: "var(--canvas)" }}
          >
            <path
              d="M2 5l2.5 2.5L8 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Priority */}
      <div className="flex-shrink-0 w-4 flex items-center justify-center">
        <PriorityChip priority={task.priority} />
      </div>

      {/* Title — inline editable */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={(e) => {
          if (!isEditingTitle) {
            e.stopPropagation();
          }
        }}
      >
        {isEditingTitle ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={commitTitle}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full bg-transparent font-serif text-base text-[var(--ink)]",
              "focus:outline-none border-b border-[var(--ink-amber)]",
            )}
          />
        ) : (
          <span
            onClick={startEditTitle}
            className={cn(
              "font-serif text-base truncate block",
              isLesno
                ? "line-through text-[var(--ink-muted)]"
                : "text-[var(--ink)]",
            )}
          >
            {task.title}
          </span>
        )}
      </div>

      {/* Project */}
      {task.projects.length > 0 && (
        <span className="font-mono text-xs text-[var(--ink-muted)] truncate max-w-[120px] flex-shrink-0">
          {task.projects[0]!.name}
          {task.projects.length > 1 && ` +${task.projects.length - 1}`}
        </span>
      )}

      {/* Status badge — mono metadata register */}
      <span className="font-mono text-xs text-[var(--ink-muted)] flex-shrink-0 uppercase tracking-[0.04em]">
        {STATUS_LABELS[task.status as Status]}
      </span>

      {/* Due date */}
      {task.dueDate && (
        <span
          className={cn(
            "font-mono text-xs flex-shrink-0",
            isOverdue ? "text-[var(--ink-coral)]" : "text-[var(--ink-muted)]",
          )}
        >
          {formatDate(task.dueDate)}
        </span>
      )}

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded",
              "hover:bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]",
            )}
            aria-label="Task options"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="font-serif text-base"
            onClick={() => onRowClick(task.id)}
          >
            Open detail
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
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
