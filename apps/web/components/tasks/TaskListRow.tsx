"use client";

import { memo, useRef, useState, useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, MoreHorizontal, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { PriorityChip } from "./PriorityChip";
import {
  advanceRecurringTask,
  updateTask,
  updateTaskStatus,
} from "@/app/actions/tasks";
import { shortRuleLabel } from "@/lib/tasks/recurrence";
import { sfx } from "@/lib/ui/sfx";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { tintFor } from "@/lib/tint";
import { STATUS_LABELS, STATUS_TINT, type TaskStatus as Status } from "./status";
import type { TasksOptimisticDispatch } from "./TasksClient";

interface Props {
  task: TaskWithProjects;
  onRowClick: (id: string) => void;
  addOptimistic: TasksOptimisticDispatch;
}

/**
 * Document-tier task list row on the SDC-1 register: a 36px hover-backplate
 * row (no card chrome), title in `text-body`, meta in `text-micro` sentence
 * case, dates in mono. The row doubles as the dnd-kit sortable node; the old
 * Motion `layout` prop is gone because layout projection and dnd-kit's
 * transform both write `transform` on the same node, which is the drooping
 * bug's literal root cause elsewhere in the app.
 */
export const TaskListRow = memo(function TaskListRow({
  task,
  onRowClick,
  addOptimistic,
}: Props) {
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
          addOptimistic({ type: "revert", id: task.id });
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
    // Issue #144: a recurring task never gets permanently completed from the
    // checkbox; completing the current occurrence advances it to the next date.
    if (task.recurrence && !isLesno) {
      sfx.play("taskComplete");
      startTransition(async () => {
        const r = await advanceRecurringTask({ id: task.id, mode: "complete" });
        if (!r.success) {
          toast.error(r.error);
          return;
        }
        addOptimistic({
          type: "update",
          id: task.id,
          patch: { dueDate: r.data.nextDueDate, status: "not started", completedAt: null },
        });
        toast("Done. Next occurrence scheduled.");
      });
      return;
    }
    const newStatus: Status = isLesno ? "not started" : "lesno";
    // Cue only on the completing direction (checking off), never on un-complete.
    if (newStatus === "lesno") sfx.play("taskComplete");
    startTransition(async () => {
      addOptimistic({
        type: "update",
        id: task.id,
        patch: { status: newStatus },
      });
      const r = await updateTaskStatus({ id: task.id, newStatus });
      if (!r.success) {
        toast.error(r.error);
        addOptimistic({ type: "revert", id: task.id });
        return;
      }
      if (r.data.becameLesno) toast("Lesno.");
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={cn(
        "group flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2",
        "transition-colors duration-[160ms] ease-out",
        isDragging && "opacity-0",
        // Two-tier "done": neutral hover backplate + dimmed ink (the filled
        // check on the box carries the completion signal).
        isLesno ? "bg-[var(--hover)]" : "hover:bg-[var(--hover)]"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab text-[var(--ink-faint)] opacity-0 transition-opacity duration-[160ms] active:cursor-grabbing group-hover:opacity-100"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        onPointerDown={(e) => {
          listeners?.onPointerDown?.(e);
        }}
      >
        <GripVertical size={14} />
      </button>

      {/* Completion checkbox: outline box at rest, ink fill + canvas check
          when done. Neutral by design; done-ness needs no hue. */}
      <button
        type="button"
        onClick={toggleLesno}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm border",
          "transition-colors duration-[160ms] ease-out",
          isLesno
            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]"
            : "border-[var(--edge-strong)] hover:border-[var(--ink-muted)]"
        )}
        aria-label={isLesno ? "Mark incomplete" : "Mark complete"}
      >
        {isLesno && <Check size={11} strokeWidth={2.5} />}
      </button>

      {/* Priority */}
      <div className="flex w-4 shrink-0 items-center justify-center">
        <PriorityChip priority={task.priority} />
      </div>

      {/* Title — inline editable */}
      <div
        className="min-w-0 flex-1 cursor-pointer"
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
              "w-full bg-transparent text-body text-[var(--ink)]",
              "border-b border-[var(--edge-strong)] focus:outline-none"
            )}
          />
        ) : (
          <span
            onClick={startEditTitle}
            className={cn(
              "block truncate text-body",
              isLesno ? "line-through text-[var(--ink-faint)]" : "text-[var(--ink)]"
            )}
          >
            {task.title}
          </span>
        )}
      </div>

      {/* Trailing meta, right-aligned (Craft Tasks hub grammar): quiet
          text-micro chips where color is data — project tinted via tintFor,
          status via STATUS_TINT ("not started" has no tint and falls back to
          the neutral --hover fill), overdue keeps the coral functional chip. */}

      {/* Project */}
      {task.projects.length > 0 && (
        <span
          className={cn(
            "inline-flex max-w-[140px] shrink-0 items-center rounded-full px-2 py-0.5 text-micro font-medium",
            "bg-[var(--tint-bg,var(--hover))] text-[var(--tint-ink,var(--ink-muted))]",
            tintFor(task.projects[0]!.id)
          )}
        >
          <span className="truncate">{task.projects[0]!.name}</span>
          {task.projects.length > 1 && <span className="pl-0.5">+{task.projects.length - 1}</span>}
        </span>
      )}

      {/* Recurring marker (issue #144), quiet meta. */}
      {task.recurrence && (
        <span
          title={shortRuleLabel(task.recurrence)}
          className="inline-flex shrink-0 items-center gap-1 text-micro text-[var(--ink-muted)]"
        >
          <Repeat size={11} strokeWidth={2} />
          {shortRuleLabel(task.recurrence)}
        </span>
      )}

      {/* Status */}
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-micro font-medium",
          "bg-[var(--tint-bg,var(--hover))] text-[var(--tint-ink,var(--ink-muted))]",
          STATUS_TINT[task.status as Status]
        )}
      >
        {STATUS_LABELS[task.status as Status]}
      </span>

      {/* Due date: overdue reads as a 12%-alpha coral chip with a 6px dot;
          on-track dates are a quiet neutral chip. */}
      {task.dueDate &&
        (isOverdue ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-micro tabular-nums"
            style={{
              color: "var(--ink-coral)",
              background: "color-mix(in oklch, var(--ink-coral) 12%, transparent)",
            }}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: "var(--ink-coral)" }}
            />
            {formatDate(task.dueDate)}
            {task.dueTime ? ` \u00b7 ${task.dueTime}` : ""}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--hover)] px-2 py-0.5 font-mono text-micro tabular-nums text-[var(--ink-muted)]">
            {formatDate(task.dueDate)}
            {task.dueTime ? ` \u00b7 ${task.dueTime}` : ""}
          </span>
        ))}

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "rounded-sm p-1 opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100",
              "text-[var(--ink-faint)] hover:bg-[var(--selected)] hover:text-[var(--ink)]"
            )}
            aria-label="Task options"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-meta" onClick={() => onRowClick(task.id)}>
            Open detail
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

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
