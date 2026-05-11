"use client";

import { useState, useRef, useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { PriorityChip } from "./PriorityChip";
import { updateTask, updateTaskStatus } from "@/app/actions/tasks";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

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
}

export function TaskListRow({ task, onRowClick }: Props) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
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
        const r = await updateTask({ id: task.id, title: trimmed });
        if (!r.success) toast.error(r.error);
        else router.refresh();
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
      const r = await updateTaskStatus({ id: task.id, newStatus });
      if (!r.success) toast.error(r.error);
      else {
        if (r.data.becameLesno) toast("Lesno.");
        router.refresh();
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 h-10 px-2 rounded",
        "hover:bg-secondary/40 transition-colors group",
        isDragging && "opacity-0",
        isPending && "opacity-50",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        onPointerDown={(e) => {
          // Prevent drag from blocking other interactions
          listeners?.onPointerDown?.(e);
        }}
      >
        <GripVertical size={14} />
      </button>

      {/* Lesno checkbox */}
      <button
        type="button"
        onClick={toggleLesno}
        className={cn(
          "w-4 h-4 rounded border border-border flex-shrink-0 flex items-center justify-center",
          isLesno && "bg-primary border-primary",
          "transition-colors",
        )}
        aria-label={isLesno ? "Mark incomplete" : "Mark complete"}
      >
        {isLesno && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className="text-primary-foreground"
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
      <div className="flex-shrink-0">
        <PriorityChip priority={task.priority} />
      </div>

      {/* Title — inline editable */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={(e) => {
          if (!isEditingTitle) {
            // body click (not title) → detail panel
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
            className="w-full bg-transparent font-serif text-base text-foreground focus:outline-none border-b border-ring"
          />
        ) : (
          <span
            onClick={startEditTitle}
            className={cn(
              "font-serif text-base text-foreground truncate block",
              isLesno && "line-through opacity-60",
            )}
          >
            {task.title}
          </span>
        )}
      </div>

      {/* Project */}
      {task.projects.length > 0 && (
        <span className="font-sans text-[13px] text-muted-foreground truncate max-w-[120px] flex-shrink-0">
          {task.projects[0]!.name}
          {task.projects.length > 1 && ` +${task.projects.length - 1}`}
        </span>
      )}

      {/* Status badge */}
      <span className="font-sans text-[13px] text-muted-foreground flex-shrink-0">
        {STATUS_LABELS[task.status as Status]}
      </span>

      {/* Due date */}
      {task.dueDate && (
        <span
          className={cn(
            "font-sans text-[13px] flex-shrink-0",
            isOverdue ? "text-destructive" : "text-muted-foreground",
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
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary"
            aria-label="Task options"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="font-sans text-[13px]"
            onClick={() => onRowClick(task.id)}
          >
            Open detail
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
