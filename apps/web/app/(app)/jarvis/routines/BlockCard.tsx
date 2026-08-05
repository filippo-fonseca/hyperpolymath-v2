"use client";

/**
 * BlockCard — one sortable row in the ordered block list (Spacedrive register).
 * A mini entity-card: step number, drag handle, a lucide tool-icon chip (from
 * the curated catalog), a truncated NL directive preview, and edit / remove
 * affordances. Uses @dnd-kit useSortable mirroring the tasks TaskListRow pattern.
 * No hover scale — drag is the only transform.
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquare, Pencil, Trash2 } from "lucide-react";
import type { RoutineBlock } from "@hyperpolymath/jarvis-core";
import {
  formatLightsBlockPreview,
  readLightsParams,
} from "@/lib/jarvis/lights-block-params";
import { catalogEntry } from "./block-catalog";

interface Props {
  block: RoutineBlock;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
}

function blockPreview(block: RoutineBlock): string {
  if (block.tool === "control_lights") {
    return formatLightsBlockPreview(readLightsParams(block));
  }
  if (block.tool === "open_workspace") {
    const items = block.params?.["items"];
    const count = Array.isArray(items) ? items.length : 0;
    return count > 0
      ? `${count} item${count === 1 ? "" : "s"} to open`
      : "No items — plain tool call.";
  }
  return block.nlDirective?.trim()
    ? block.nlDirective
    : "No directive — plain tool call.";
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
      className="flex items-center gap-3 rounded-xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-3 shadow-[var(--shadow-card)] dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms] active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--sd-line)] font-mono text-micro text-[var(--sd-ink-dull)]">
        {index + 1}
      </span>

      <span
        style={{ background: "var(--sd-input)" }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--sd-line)] text-[var(--sd-ink-dull)]"
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
 <p className="text-meta font-medium text-[var(--sd-ink)]">
            {entry?.label ?? block.tool}
          </p>
          {block.loadingInstruction?.trim() ? (
            <span
 className="inline-flex items-center gap-1 rounded-full border border-[var(--sd-line)] px-1.5 py-0.5 text-micro text-[var(--sd-ink-dull)]"
              title="Speaks while loading"
            >
              <MessageSquare size={10} />
              chatter
            </span>
          ) : null}
        </div>
 <p className="truncate text-meta text-[var(--sd-ink-dull)]">
          {blockPreview(block)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-[8px] border border-[var(--sd-line)] p-1.5 text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
          aria-label="Edit block"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-[8px] border border-[var(--sd-line)] p-1.5 text-[var(--sd-ink-dull)] hover:border-[color-mix(in_oklch,var(--ink-coral)_40%,transparent)] hover:text-[var(--ink-coral)] transition-colors duration-[140ms]"
          aria-label="Remove block"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
