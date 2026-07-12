"use client";

import { HashtagChip } from "@/components/captures/HashtagChip";
import { PersonChip } from "@/components/captures/PersonChip";
import { tokenizeContent } from "@/lib/captures/tokenize-content";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { shortRuleLabel } from "@/lib/tasks/recurrence";
import { cn } from "@/lib/utils";
import { Check, Repeat } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
  tone?: "muted" | "coral" | "cyan";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 shrink-0 backdrop-blur-md",
        "font-mono text-[11px] border",
        tone === "coral"
          ? "border-[var(--ink-coral)]/40 text-[var(--ink-coral)]"
          : tone === "cyan"
            ? "border-[var(--hud-cyan)]/40 text-[var(--hud-cyan)]"
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
  const reducedMotion = useReducedMotion() ?? false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Parse YMD as LOCAL midnight (not UTC midnight) so a 2026-06-08 due
  // date doesn't read as 2026-06-07 in negative-UTC timezones.
  const dueLocal = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : null;
  const isOverdue = dueLocal !== null && task.status !== "lesno" && dueLocal < today;
  const isLesno = task.status === "lesno";

  // Tailwind's group-hover modifier on the checkbox keys off this class. The
  // focus-within and coarse-pointer variants keep the control discoverable
  // without requiring a hover-capable pointer.
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart?.(task.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      className={cn(
        "group/task select-none",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
        whileHover={reducedMotion || isDragging ? undefined : { y: -1 }}
        transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "relative rounded-[0.375rem] border border-[var(--deck-line)] bg-[var(--deck-panel)] px-3 py-2.5",
          "transition-colors duration-[var(--dur-hover)] hover:border-[var(--deck-hover)]",
          isPending && "opacity-50",
          // S-8: completed (lesno) cards render dimmed.
          isLesno && "opacity-70",
          // S-4 selected treatment: amber glow + ring (replaces the prior
          // cyan ring — cyan stays reserved for drag-over/focus per guardrail).
          isSelected && "[--glass-glow-color:var(--ink-amber)] ring-1 ring-[var(--ink-amber)]/40"
        )}
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
              "absolute -left-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-[0.375rem] border bg-[var(--deck-app)] transition-opacity duration-[var(--dur-hover)] cursor-pointer-always focus-visible:opacity-100 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] group-focus-within/task:opacity-100 [@media(pointer:coarse)]:opacity-100",
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
        <button
          type="button"
          onClick={(ev) => {
            if (onToggleSelected && (ev.metaKey || ev.ctrlKey || ev.shiftKey || selectionActive)) {
              onToggleSelected(task.id, ev);
              return;
            }
            onClick(task.id);
          }}
          className="block w-full rounded-[0.25rem] text-left focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <div
            className={cn(
              "mb-2 line-clamp-2 font-serif text-base",
              isLesno ? "line-through text-[var(--ink-muted)]" : "text-[var(--ink)]"
            )}
          >
            <TaskTitle task={task} />
          </div>

          {(task.recurrence ||
            cardFields.priority ||
            cardFields.dueDate ||
            cardFields.project ||
            task.hashtags.length > 0 ||
            task.people.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Recurring-task marker (issue #144) — cyan repeat pill, distinct
                from one-off tasks and from amber habits. */}
              {task.recurrence && (
                <CardPill tone="cyan">
                  <Repeat size={11} strokeWidth={2} />
                  {shortRuleLabel(task.recurrence)}
                </CardPill>
              )}
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
                  <span className="max-w-[140px] truncate">{task.projects[0]?.name}</span>
                  {task.projects.length > 1 && ` +${task.projects.length - 1}`}
                </CardPill>
              )}
              {/* Issue #159 — inline #hashtag chips */}
              {task.hashtags.map((h) => (
                <HashtagChip key={h.id} displayName={h.displayName} asButton={false} />
              ))}
              {/* Issue #159 — inline @person chips */}
              {task.people.map((p) => (
                <PersonChip key={p.id} name={p.name} asButton={false} />
              ))}
            </div>
          )}
        </button>
      </motion.div>
    </div>
  );
}

/** Renders the task title with inline #hashtag and @person chips substituted. */
function TaskTitle({ task }: { task: TaskWithProjects }) {
  const tagLookup = new Map(task.hashtags.map((h) => [h.name, h.displayName]));
  const personNames = task.people.map((p) => p.name);
  const segments = tokenizeContent(task.title, { hashtagDisplay: tagLookup, personNames });
  return (
    <>
      {segments.map((seg, i) => {
        const key = `${seg.kind}-${i}-${seg.kind === "text" ? seg.value : seg.display}`;
        if (seg.kind === "hashtag") {
          return <HashtagChip key={key} displayName={seg.display} asButton={false} />;
        }
        if (seg.kind === "person") {
          return <PersonChip key={key} name={seg.display} asButton={false} />;
        }
        return <span key={key}>{seg.value}</span>;
      })}
    </>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
