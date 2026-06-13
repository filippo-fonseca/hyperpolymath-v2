"use client";

import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { PriorityChip } from "./PriorityChip";

/** Which property pills render on a task card. Owned + persisted by KanbanBoard. */
export interface CardFields {
  priority: boolean;
  dueDate: boolean;
  project: boolean;
}

export const DEFAULT_CARD_FIELDS: CardFields = {
  priority: true,
  dueDate: true,
  project: true,
};

/** Glassy segmented pill wrapper for a single card metadata chip. */
function CardPill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "coral";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 shrink-0 backdrop-blur-md",
        "font-mono text-[11px] border",
        tone === "coral"
          ? "border-[var(--ink-coral)]/40 text-[var(--ink-coral)]"
          : "border-[var(--edge)] text-[var(--ink-muted)]"
      )}
      style={{
        backgroundColor: "color-mix(in oklch, var(--surface-raised) 70%, transparent)",
        boxShadow: "inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo)",
      }}
    >
      {children}
    </span>
  );
}

interface Props {
  task: TaskWithProjects;
  onClick: (id: string) => void;
  cardFields?: CardFields;
  isDragging?: boolean;
  isPending?: boolean;
  draggable?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  /** Multi-select integration. When `selectionActive` is true, the checkbox
   * is always visible; otherwise it appears only on hover. Click toggles
   * via `onToggleSelected`. Plain card click still routes through `onClick`
   * unless `onToggleSelected` is provided AND the user shift/meta-clicks
   * the card body (handled in the parent). */
  selectionActive?: boolean;
  isSelected?: boolean;
  onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void;
}

export function TaskCard({
  task,
  onClick,
  cardFields = DEFAULT_CARD_FIELDS,
  isDragging,
  isPending,
  draggable,
  onDragStart,
  onDragEnd,
  selectionActive,
  isSelected,
  onToggleSelected,
}: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Parse YMD as LOCAL midnight (not UTC midnight) so a 2026-06-08 due
  // date doesn't read as 2026-06-07 in negative-UTC timezones.
  const dueLocal = task.dueDate ? new Date(task.dueDate + "T00:00:00") : null;
  const isOverdue = dueLocal !== null && task.status !== "lesno" && dueLocal < today;
  const isLesno = task.status === "lesno";

  // Tailwind's group-hover modifier on the checkbox keys off this class.
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart?.(task.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={(ev) => {
        if (onToggleSelected && (ev.metaKey || ev.ctrlKey || ev.shiftKey || selectionActive)) {
          onToggleSelected(task.id, ev);
          return;
        }
        onClick(task.id);
      }}
      className={cn(
        "group/task select-none",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
        whileHover={
          isDragging
            ? undefined
            : {
                y: -2,
                boxShadow:
                  "0 8px 24px rgba(0,0,0,0.18), inset 0 0 0 1px color-mix(in oklch, var(--edge-hud) 60%, transparent)",
              }
        }
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "relative rounded-xl px-3.5 py-2.5",
          isPending && "opacity-50",
          isLesno && "opacity-80",
          isSelected && "ring-2 ring-[var(--hud-cyan)] ring-offset-1 ring-offset-[var(--canvas)]"
        )}
        style={{
          background: "var(--task-card-bg, var(--surface-raised))",
          boxShadow: "0 1px 2px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {onToggleSelected ? (
          <button
            type="button"
            aria-label={isSelected ? "Deselect task" : "Select task"}
            aria-pressed={isSelected}
            onClick={(ev) => {
              ev.stopPropagation();
              onToggleSelected(task.id, ev);
            }}
            className={cn(
              "absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-md border bg-[var(--canvas)] transition-opacity duration-100 cursor-pointer-always",
              isSelected
                ? "opacity-100 border-[var(--hud-cyan)] bg-[var(--hud-cyan)] text-[var(--canvas)]"
                : selectionActive
                  ? "opacity-100 border-[var(--edge)] text-transparent"
                  : "opacity-0 group-hover/task:opacity-100 border-[var(--edge)] text-transparent"
            )}
          >
            <Check size={11} strokeWidth={2.5} />
          </button>
        ) : null}
        <p
          className={cn(
            "font-serif text-base line-clamp-2 mb-2",
            isLesno ? "line-through text-[var(--ink-muted)]" : "text-[var(--ink)]"
          )}
        >
          {task.title}
        </p>

        {(cardFields.priority || cardFields.dueDate || cardFields.project) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {cardFields.priority && (
              <CardPill>
                <PriorityChip priority={task.priority} />
                {task.priority}
              </CardPill>
            )}
            {cardFields.dueDate && task.dueDate && (
              <CardPill tone={isOverdue ? "coral" : "muted"}>{formatDate(task.dueDate)}</CardPill>
            )}
            {cardFields.project && task.projects.length > 0 && (
              <CardPill>
                <span className="truncate max-w-[140px]">{task.projects[0]!.name}</span>
                {task.projects.length > 1 && ` +${task.projects.length - 1}`}
              </CardPill>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
