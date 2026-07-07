"use client";

/**
 * BlockCard — one sortable row in the ordered block list. Shows the step number,
 * a drag handle, the tool icon+label (from the curated catalog), a truncated NL
 * directive preview, and edit / remove affordances. Uses @dnd-kit useSortable
 * mirroring the tasks TaskListRow pattern.
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquare, Pencil, Trash2 } from "lucide-react";
import type { RoutineBlock } from "@hyperpolymath/jarvis-core";
import { catalogEntry } from "./block-catalog";

interface Props {
  block: RoutineBlock;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
}

export function BlockCard({ block, index, onEdit, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const entry = catalogEntry(block.tool);
  const Icon = entry?.icon;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="glass-tile flex items-center gap-3 rounded-lg p-3"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--edge)] font-mono text-[11px] text-[var(--ink-muted)]">
        {index + 1}
      </span>

      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)]">
        {Icon ? <Icon className="h-4 w-4" /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-serif text-[15px] text-[var(--ink)]">
            {entry?.label ?? block.tool}
          </p>
          {block.loadingInstruction?.trim() ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[var(--edge)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
              title="Speaks while loading"
            >
              <MessageSquare size={10} />
              chatter
            </span>
          ) : null}
        </div>
        <p className="truncate font-serif text-[13px] text-[var(--ink-muted)]">
          {block.nlDirective?.trim()
            ? block.nlDirective
            : "No directive — plain tool call."}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-[var(--edge)] p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] transition-colors duration-100"
          aria-label="Edit block"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md border border-[var(--edge)] p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink-coral,var(--ink))] transition-colors duration-100"
          aria-label="Remove block"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
