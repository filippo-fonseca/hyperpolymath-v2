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
import { PriorityChip } from "./PriorityChip";
import { shortRuleLabel } from "@/lib/tasks/recurrence";

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

/**
 * Meta chip for a single card metadata field, on the sd register. Mirrors the
 * merged Life OS entity-card `Chip` grammar (rounded-md, 1px --sd-line hairline,
 * translucent --sd-box fill, mono 10px uppercase). Functional tones (coral =
 * overdue, cyan = recurring) tint via 15%-alpha over the box surface with a 30%
 * border — never chrome (D6).
 */
function CardPill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "coral" | "cyan";
}) {
  const hue =
    tone === "coral" ? "var(--ink-coral)" : tone === "cyan" ? "var(--sd-accent)" : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 shrink-0",
        "font-mono text-[10px] uppercase tracking-[0.10em] tabular-nums",
        !hue && "border-[var(--sd-line)] text-[var(--sd-ink-dull)]"
      )}
      style={
        hue
          ? {
              color: hue,
              borderColor: `color-mix(in srgb, ${hue} 30%, var(--sd-line))`,
              background: `color-mix(in srgb, ${hue} 15%, var(--sd-box))`,
            }
          : { background: "color-mix(in srgb, var(--sd-box) 60%, transparent)" }
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
   * unless `onToggleSelected` is provided AND the user shift/meta-clicks
   * the card body (handled in the parent). */
  selectionActive?: boolean;
  isSelected?: boolean;
  onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void;
  /** True for the single beat after this card is dropped into a column, so it
   * settles with a transform-only spring overshoot (~4%, the success moment,
   * D4). Cleared by the parent shortly after; reduced-motion skips the pop. */
  justSettled?: boolean;
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
  // Resting opacity is driven through Motion's animate target (not a Tailwind
  // class), since Motion writes inline style that would otherwise win: completed
  // (lesno) cards dim to 0.7, optimistic-pending to 0.5.
  const restOpacity = isLesno ? 0.7 : isPending ? 0.5 : 1;

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
        // Ghost fade: the source dims to a ghost over 300ms while dragging
        // (dossier §8). Transition lives on the outer wrapper so it only
        // reacts to the isDragging toggle, not the inner entrance motion.
        "group/task select-none transition-opacity duration-300 ease-out",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <motion.div
        initial={
          reduced ? false : justSettled ? { opacity: 0, scale: 0.97 } : { opacity: 0, y: -4 }
        }
        animate={
          reduced
            ? { opacity: restOpacity }
            : justSettled
              ? { opacity: restOpacity, scale: 1 }
              : { opacity: restOpacity, y: 0 }
        }
        exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
        transition={
          reduced
            ? { duration: 0 }
            : justSettled
              ? // Success moment: transform-only spring, slight overshoot (~4%),
                // interruptible. No rotation, no lift (dossier §8, D4).
                { type: "spring", bounce: 0.24, duration: 0.36 }
              : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }
        }
        className={cn(
          // Mini entity card on the sd register: --sd-box surface, 8px radius,
          // 1px --sd-line hairline, white inset top hairline. Hover soft-lands
          // bg + border toward the accent (200ms), NO scale, NO lift (seed §Cards).
          "relative rounded-lg px-3 py-2.5 border border-[var(--sd-line)] bg-[var(--sd-box)]",
          "transition-[border-color,background-color] duration-200 ease-[var(--ease-soft-landing)]",
          !isDragging &&
            "hover:border-[color-mix(in_srgb,var(--sd-accent)_28%,var(--sd-line))] hover:bg-[var(--sd-hover)]",
          // Multi-select treatment: amber backplate + ring (cyan stays reserved
          // for drag-over / focus per guardrail).
          isSelected &&
            "ring-1 ring-[var(--ink-amber)]/45 border-[color-mix(in_srgb,var(--ink-amber)_40%,var(--sd-line))]"
        )}
        style={{ boxShadow: "rgba(255,255,255,0.15) 0 1px 0 inset" }}
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
        <div
          className={cn(
            "font-serif text-sm font-medium line-clamp-2 mb-2",
            isLesno ? "line-through text-[var(--sd-ink-dull)]" : "text-[var(--sd-ink)]"
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
            {/* Priority renders as a bare dot (seed §Cards meta row) — the amber
                opacity-ladder dot / P∞ glyph carries the signal, no pill. */}
            {cardFields.priority && (
              <span className="inline-flex items-center px-0.5">
                <PriorityChip priority={task.priority} />
              </span>
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
      </motion.div>
    </div>
  );
}

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
