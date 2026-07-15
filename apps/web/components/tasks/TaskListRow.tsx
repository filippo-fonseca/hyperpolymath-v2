"use client";

import { useState, useRef, useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, useReducedMotion } from "motion/react";
import { Check, GripVertical, MoreHorizontal, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { PriorityChip } from "./PriorityChip";
import {
  advanceRecurringTask,
  updateTask,
  updateTaskStatus,
} from "@/app/actions/tasks";
import { shortRuleLabel } from "@/lib/tasks/recurrence";
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
 * Visual register (sd dossier list-row):
 *  - 6px-radius row, neutral --sd-hover backplate on hover (and persistent when
 *    lesno) — no card chrome, no left-edge accent.
 *  - Completion: crisp --sd-accent check box (Life OS habit affordance).
 *  - Title in font-serif --sd-ink (line-through + --sd-ink-faint when lesno).
 *  - PriorityChip uses the amber opacity ladder + Infinity icon (no pills).
 *  - Status + Due in mono metadata register (--sd-ink-dull); an overdue due
 *    date reads as a 15%-alpha coral tinted chip + 6px sd-dot (D6).
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
  const reduced = useReducedMotion();

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
    // Issue #144 — a recurring task never gets permanently completed from the
    // checkbox: completing the current occurrence advances it to the next date.
    if (task.recurrence && !isLesno) {
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
    <motion.div
      ref={setNodeRef}
      layout
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: reduced ? 0 : 0.16, ease: [0.25, 1, 0.5, 1] }}
      style={dndStyle}
      className={cn(
        // Dossier list row on the sd register — 6px radius, hover backplate.
        "group flex items-center gap-2 h-10 px-2 rounded-[6px] cursor-pointer",
        "transition-colors duration-[120ms] ease-out",
        // Two-tier "done": neutral sd-hover backplate + dimmed ink (the accent
        // check on the box carries the completion signal).
        isLesno
          ? "bg-[var(--sd-hover)]"
          : "hover:bg-[var(--sd-hover)]",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-[var(--sd-ink-faint)] opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        onPointerDown={(e) => {
          listeners?.onPointerDown?.(e);
        }}
      >
        <GripVertical size={14} />
      </button>

      {/* Completion checkbox — crisp sd-accent check (matches the Life OS habit
          affordance): outline box at rest, accent fill + white check when done. */}
      <button
        type="button"
        onClick={toggleLesno}
        className={cn(
          "w-4 h-4 rounded-[5px] border flex-shrink-0 flex items-center justify-center",
          "transition-colors duration-[120ms] ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
          isLesno
            ? "bg-[var(--sd-accent)] border-[var(--sd-accent)]"
            : "border-[var(--sd-line)] hover:border-[var(--sd-accent)]",
        )}
        aria-label={isLesno ? "Mark incomplete" : "Mark complete"}
      >
        {isLesno && (
          <Check
            size={11}
            strokeWidth={2.5}
            style={{ color: "hsl(235 45% 9%)" }}
          />
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
              "w-full bg-transparent font-serif text-base text-[var(--sd-ink)]",
              "focus:outline-none border-b border-[var(--sd-accent)]",
            )}
          />
        ) : (
          <span
            onClick={startEditTitle}
            className={cn(
              "font-serif text-base truncate block",
              isLesno
                ? "line-through text-[var(--sd-ink-faint)]"
                : "text-[var(--sd-ink)]",
            )}
          >
            {task.title}
          </span>
        )}
      </div>

      {/* Project */}
      {task.projects.length > 0 && (
        <span className="font-mono text-xs text-[var(--sd-ink-faint)] truncate max-w-[120px] flex-shrink-0">
          {task.projects[0]!.name}
          {task.projects.length > 1 && ` +${task.projects.length - 1}`}
        </span>
      )}

      {/* Recurring marker (issue #144) — accent cyan, distinct from one-offs. */}
      {task.recurrence && (
        <span
          title={shortRuleLabel(task.recurrence)}
          className="inline-flex items-center gap-1 font-mono text-xs text-[var(--sd-accent)] flex-shrink-0 uppercase tracking-[0.04em]"
        >
          <Repeat size={11} strokeWidth={2} />
          {shortRuleLabel(task.recurrence)}
        </span>
      )}

      {/* Status badge — mono metadata register */}
      <span className="font-mono text-xs text-[var(--sd-ink-dull)] flex-shrink-0 uppercase tracking-[0.04em]">
        {STATUS_LABELS[task.status as Status]}
      </span>

      {/* Due date — overdue reads as a 15%-alpha coral tint chip with a 6px dot;
          on-track dates stay quiet mono metadata. */}
      {task.dueDate &&
        (isOverdue ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] flex-shrink-0"
            style={{
              color: "var(--ink-coral)",
              borderColor: "color-mix(in srgb, var(--ink-coral) 30%, var(--sd-line))",
              background: "color-mix(in srgb, var(--ink-coral) 15%, var(--sd-box))",
            }}
          >
            <span
              aria-hidden
              className="sd-dot"
              style={{ background: "var(--ink-coral)" }}
            />
            {formatDate(task.dueDate)}
          </span>
        ) : (
          <span className="font-mono text-xs text-[var(--sd-ink-dull)] flex-shrink-0">
            {formatDate(task.dueDate)}
          </span>
        ))}

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-[5px]",
              "hover:bg-[var(--sd-selected)] text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]",
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
