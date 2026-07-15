"use client";

import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { TaskCard } from "./TaskCard";

interface Props {
  /** Undated, non-lesno tasks (`dueDate IS NULL AND status != 'lesno'`).
   * Passed in full — NO 24-card truncation (D-01). */
  inboxTasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  /** Lifted drag state — the card currently being dragged anywhere on the
   * tasks surface. Shared with KanbanBoard so the Inbox can be a drop target
   * for cards dragged out of any kanban column (D-04). */
  draggedTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  /** Fired when a card is dropped onto the Inbox surface. Parent reads
   * `draggedTaskId` and nulls the task's due date via the existing
   * `bulkUpdateTaskDueDate` server action. */
  onDrop: () => void | Promise<void>;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
}

/**
 * Persistent, always-present Inbox side column (D-01 / TASK-INBOX-01).
 *
 * Promotes the former collapsed inbox tray into a first-class 240px left
 * column — the primary visual anchor of the tasks surface (UI-SPEC S-1).
 * Shows EVERY undated task (no `slice(0, 24)` cap) and acts as an HTML5
 * native DnD drop target: dropping a card here nulls its due date
 * (D-04 / TASK-INBOX-02), bidirectional with the drag-out-of-inbox flow.
 *
 * Aesthetic guardrails: cyan ONLY appears on drag-over (the reserved
 * drag-target accent); default borders stay neutral. No neumorphic paired
 * shadows, no HUD keyframes — the column is always present, so no
 * AnimatePresence wraps it.
 */
export function InboxColumn({
  inboxTasks,
  onTaskClick,
  draggedTaskId,
  onDragStart,
  onDragEnd,
  onDrop,
  selectedIds,
  onToggleSelected,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      role="region"
      aria-label="Tasks without a due date"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        void onDrop();
      }}
      className={cn(
        "rounded-xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-4 w-[240px] shrink-0 flex flex-col min-h-0 overflow-y-auto transition-[border-color,box-shadow] duration-150",
        // S-1 drag-target active state — cyan border + ring, shown ONLY while
        // a card is hovering over the Inbox during a drag.
        isDragOver &&
          "border-[color:color-mix(in_oklch,var(--hud-cyan)_50%,transparent)] ring-1 ring-[var(--hud-cyan)]/30"
      )}
    >
      <div className="mb-3 flex items-center justify-between px-0.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Inbox · undated
        </p>
        <p className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
          {inboxTasks.length}
        </p>
      </div>
      {inboxTasks.length === 0 ? (
        <p className="px-0.5 font-sans text-sm text-[var(--ink-muted)]">Inbox is empty.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {inboxTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onClick={onTaskClick}
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={draggedTaskId === t.id}
              selectionActive={selectedIds.size > 0}
              isSelected={selectedIds.has(t.id)}
              onToggleSelected={(id) => onToggleSelected(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
