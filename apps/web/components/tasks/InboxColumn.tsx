"use client";

import { DeckPanel, SectionHeader } from "@/components/spacedrive";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { type DragEvent, useState } from "react";
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
    <DeckPanel
      as="section"
      aria-label="Tasks without a due date"
      onDragOver={(e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        void onDrop();
      }}
      className={cn(
        "flex w-full max-h-[34vh] shrink-0 flex-col overflow-y-auto p-3 md:max-h-none md:w-[220px] lg:w-[240px]",
        // S-1 drag-target active class — cyan glow + border + ring, shown
        // ONLY while a card is hovering over the Inbox during a drag.
        isDragOver && "border-[var(--deck-accent)] ring-1 ring-[var(--deck-accent)]/30"
      )}
    >
      <SectionHeader
        title="Inbox · undated"
        eyebrow
        className="mb-2 px-1"
        action={
          <span className="font-[family-name:var(--font-mono)] text-[10px] tabular-nums text-[var(--deck-ink-dull)]">
            {inboxTasks.length}
          </span>
        }
      />
      {inboxTasks.length === 0 ? (
        <p className="px-1 py-2 font-[family-name:var(--font-sans)] text-[12px] text-[var(--deck-ink-dull)]">
          Inbox is empty.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
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
    </DeckPanel>
  );
}
