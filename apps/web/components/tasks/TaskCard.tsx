"use client";

import { HashtagChip } from "@/components/captures/HashtagChip";
import { PersonChip } from "@/components/captures/PersonChip";
import { EntityLabelsProvider } from "@/components/references/EntityLabelsProvider";
import { EntityPill } from "@/components/references/EntityPill";
import { tokenizeContent } from "@/lib/captures/tokenize-content";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { Check, Repeat } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { memo } from "react";
import { PriorityChip } from "./PriorityChip";
import { shortRuleLabel } from "@/lib/tasks/recurrence";

/** Which property pills render on a task card. Owned + persisted by the page. */
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

/**
 * Meta chip for a single card metadata field. Chips inside a bordered card
 * carry no border of their own (SDC-1 §2.6, one border per nesting level):
 * a `--hover` fill, 4px radius, `text-micro` sentence case. Functional tones
 * (coral = overdue) tint as 12%-alpha fills, never as chrome.
 */
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
        "inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5",
        "text-micro font-medium tabular-nums",
        tone === "muted" && "bg-[var(--hover)] text-[var(--ink-muted)]"
      )}
      style={
        tone === "coral"
          ? {
              color: "var(--ink-coral)",
              background: "color-mix(in oklch, var(--ink-coral) 12%, transparent)",
            }
          : undefined
      }
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
   * unless the user shift/meta-clicks while a selection is active. */
  selectionActive?: boolean;
  isSelected?: boolean;
  onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void;
  /** True for the single beat after this card is dropped into a column: it
   * settles with a transform-only spring (no rotation, no lift). Cleared by
   * the parent shortly after; reduced motion skips the pop. */
  justSettled?: boolean;
}

export const TaskCard = memo(function TaskCard({
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
  justSettled,
}: Props) {
  const reduced = useReducedMotion();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Parse YMD as LOCAL midnight (not UTC midnight) so a 2026-06-08 due
  // date doesn't read as 2026-06-07 in negative-UTC timezones.
  const dueLocal = task.dueDate ? new Date(task.dueDate + "T00:00:00") : null;
  const isOverdue = dueLocal !== null && task.status !== "lesno" && dueLocal < today;
  const isLesno = task.status === "lesno";
  const restOpacity = isLesno ? 0.7 : isPending ? 0.5 : 1;

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
        // The drag source dims to a ghost while dragging. The transition lives
        // on this wrapper so it only reacts to the isDragging toggle.
        "group/task select-none transition-opacity duration-[280ms] ease-out",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <motion.div
        // No entrance choreography: cards are furniture, not events. The one
        // sanctioned moment is the settle pop after a drop, transform-only.
        initial={false}
        animate={
          reduced
            ? { opacity: restOpacity }
            : justSettled
              ? { opacity: restOpacity, scale: [0.97, 1] }
              : { opacity: restOpacity, scale: 1 }
        }
        transition={
          reduced
            ? { duration: 0 }
            : justSettled
              ? { type: "spring", bounce: 0.2, duration: 0.3 }
              : { duration: 0.16, ease: "easeOut" }
        }
        className={cn(
          // Card register (jul-29 craft restyle): raised white plate, one
          // hairline, soft card shadow, hover deepens the shadow. Still no
          // scale and no glow — the lift is shadow-only.
          "relative rounded-xl border px-3 py-2.5",
          "shadow-[var(--shadow-card)]",
          "transition-[border-color,background-color,box-shadow] duration-[160ms] ease-out",
          isSelected
            ? "border-[var(--edge-strong)] bg-[var(--selected)]"
            : "border-[var(--edge)] bg-[var(--surface-raised)]",
          !isDragging && !isSelected && "hover:border-[var(--edge-strong)] hover:shadow-[var(--shadow-card-hover)]"
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
              "absolute -left-1 -top-1 z-10 flex size-5 items-center justify-center rounded-sm border transition-opacity duration-[160ms] cursor-pointer-always",
              isSelected
                ? "opacity-100 border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]"
                : selectionActive
                  ? "opacity-100 border-[var(--edge-strong)] bg-[var(--surface-raised)] text-transparent"
                  : "opacity-0 group-hover/task:opacity-100 border-[var(--edge-strong)] bg-[var(--surface-raised)] text-transparent"
            )}
          >
            <Check size={11} strokeWidth={2.5} />
          </button>
        ) : null}
        <div
          className={cn(
            "mb-2 text-body font-medium line-clamp-2",
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
          <div className="flex flex-wrap items-center gap-1">
            {/* Priority renders as a bare dot: the amber opacity-ladder dot /
                P∞ glyph carries the signal, no pill. */}
            {cardFields.priority && (
              <span className="inline-flex items-center px-0.5">
                <PriorityChip priority={task.priority} />
              </span>
            )}
            {cardFields.dueDate && task.dueDate && (
              <CardPill tone={isOverdue ? "coral" : "muted"}>
                <span className="font-mono">{formatDate(task.dueDate)}</span>
              </CardPill>
            )}
            {/* Recurring-task marker (issue #144), quiet and neutral. */}
            {task.recurrence && (
              <CardPill>
                <Repeat size={11} strokeWidth={2} />
                {shortRuleLabel(task.recurrence)}
              </CardPill>
            )}
            {cardFields.project && task.projects.length > 0 && (
              <CardPill>
                <span className="max-w-[140px] truncate">{task.projects[0]!.name}</span>
                {task.projects.length > 1 && ` +${task.projects.length - 1}`}
              </CardPill>
            )}
            {/* Inline #hashtag chips (issue #159) */}
            {task.hashtags.map((h) => (
              <HashtagChip key={h.id} displayName={h.displayName} asButton={false} />
            ))}
            {/* Inline @person chips (issue #159) */}
            {task.people.map((p) => (
              <PersonChip key={p.id} name={p.name} asButton={false} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
});

/**
 * Renders the task title with inline #hashtag, @person, and entity-reference
 * chips substituted.
 */
function TaskTitle({ task }: { task: TaskWithProjects }) {
  const tagLookup = new Map(task.hashtags.map((h) => [h.name, h.displayName]));
  const personNames = task.people.map((p) => p.name);
  const segments = tokenizeContent(task.title, { hashtagDisplay: tagLookup, personNames });
  return (
    <EntityLabelsProvider text={task.title}>
      {segments.map((seg, i) => {
        if (seg.kind === "hashtag") {
          return <HashtagChip key={i} displayName={seg.display} asButton={false} />;
        }
        if (seg.kind === "person") {
          return <PersonChip key={i} name={seg.display} asButton={false} />;
        }
        if (seg.kind === "entityRef") {
          return <EntityPill key={i} entityRef={seg.ref} />;
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </EntityLabelsProvider>
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
