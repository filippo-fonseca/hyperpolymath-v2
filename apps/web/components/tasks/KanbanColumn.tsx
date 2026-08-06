"use client";

import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { memo, useRef } from "react";
import { type CardFields, TaskCard } from "./TaskCard";
import { TaskCreateInline } from "./TaskCreateInline";
import { STATUS_DOT, STATUS_LABELS, STATUS_TINT, type TaskStatus } from "./status";

interface Props {
  status: TaskStatus;
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  onCreateTask: (input: { title: string; status: TaskStatus }) => Promise<void>;
  /** Opens the detail panel as a draft (preferred over inline composer). */
  onStartCreate?: (status: TaskStatus) => void;
  draggedTaskId: string | null;
  draggedFromStatus: TaskStatus | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOnColumn: (target: TaskStatus) => void;
  pendingTaskId: string | null;
  cardFields: CardFields;
  /** Selection plumbing — when supplied, cards render their checkbox and
   * the column header gets a "select all in column" toggle. */
  selectionActive?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void;
  onToggleColumnSelection?: (status: TaskStatus, taskIds: string[]) => void;
  /** Id of the card that just settled into a column, so it gets the drop
   * success-moment spring. Threaded down to the matching TaskCard. */
  settledTaskId?: string | null;
}

export const KanbanColumn = memo(function KanbanColumn({
  status,
  tasks,
  onTaskClick,
  onCreateTask,
  onStartCreate,
  draggedTaskId,
  draggedFromStatus,
  onDragStart,
  onDragEnd,
  onDropOnColumn,
  pendingTaskId,
  cardFields,
  selectionActive,
  selectedIds,
  onToggleSelected,
  onToggleColumnSelection,
  settledTaskId,
}: Props) {
  const taskIds = tasks.map((t) => t.id);
  const selectedInColumn = selectedIds ? taskIds.filter((id) => selectedIds.has(id)).length : 0;
  const allSelected = taskIds.length > 0 && selectedInColumn === taskIds.length;
  const ref = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  // Drop-target affordance via DIRECT DOM mutation, NOT React state. Setting
  // React state on every dragover re-renders the column and its cards, which
  // competes with the drop animation and produces a visible recoil snap.
  // Mutating the node's style bypasses React: the column washes to --selected
  // and a dashed accent insertion slot fades in, instantly, with no churn on
  // the children. Writes are idempotent (dragover fires repeatedly), and only
  // opacity animates on the slot.
  const isValidTarget = (): boolean => draggedTaskId !== null && draggedFromStatus !== status;

  const lightUp = () => {
    // Tint-aware drop wash: deepen the column's own pastel rather than
    // washing every status to the same neutral --selected.
    if (ref.current)
      ref.current.style.background =
        "color-mix(in srgb, var(--tint-edge, var(--accent)) 14%, var(--tint-bg, var(--surface)))";
    if (slotRef.current) {
      slotRef.current.style.height = "2.75rem";
      slotRef.current.style.marginTop = "0.5rem";
      slotRef.current.style.opacity = "1";
    }
  };
  const dimDown = () => {
    // Clearing the inline override lets the class-level tint show through
    // again (hardcoding a value here would strip the tint on drag-leave).
    if (ref.current) ref.current.style.background = "";
    if (slotRef.current) {
      slotRef.current.style.height = "0px";
      slotRef.current.style.marginTop = "0px";
      slotRef.current.style.opacity = "0";
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-xl @4xl/main:flex-1 @4xl/main:basis-0 @4xl/main:min-w-0",
        // craft-ui-v2: the column is a borderless pastel well — the tint fill
        // alone defines it (Craft's elevation lives in the white cards, not
        // the wells). "not started" has no tint class, so the fill falls back
        // to the neutral surface.
        STATUS_TINT[status],
        "bg-[var(--tint-bg,var(--surface))]",
        "transition-[background-color] duration-[160ms] ease-out"
      )}
      data-status={status}
      onDragOver={(e) => {
        if (!isValidTarget()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        lightUp();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          dimDown();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dimDown();
        if (isValidTarget()) onDropOnColumn(status);
      }}
    >
      <div className="group/colhdr flex min-w-0 items-center gap-2 px-4 pt-3 pb-2">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: STATUS_DOT[status] }}
        />
        {/* Quiet Craft section label: text-micro, count beside it. The
            in-family tint ink is the column's one identity signal. */}
        <span className="truncate text-micro font-medium text-[var(--tint-ink,var(--ink-muted))]">
          {STATUS_LABELS[status]}
        </span>
        <span className="shrink-0 text-micro tabular-nums text-[var(--ink-faint)]">
          {tasks.length}
        </span>
        {onToggleColumnSelection && tasks.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggleColumnSelection(status, taskIds)}
            className={cn(
              "ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-micro font-medium cursor-pointer-always transition-opacity duration-[160ms]",
              allSelected
                ? "bg-[var(--selected)] text-[var(--ink)] opacity-100"
                : selectionActive || selectedInColumn > 0
                  ? "text-[var(--ink-muted)] opacity-100 hover:text-[var(--ink)]"
                  : "text-[var(--ink-muted)] opacity-0 group-hover/colhdr:opacity-100 hover:text-[var(--ink)]"
            )}
            title={allSelected ? "Deselect all in column" : "Select all in column"}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        ) : null}
      </div>

      {/* Two-part column body: task list + "Add task" footer. The whole board
          scrolls at the page level (no per-column internal scroll), so the
          column grows to its content and the footer follows the list. */}
      <div className="flex flex-col px-3 pb-3">
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick}
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={draggedTaskId === task.id}
              isPending={pendingTaskId === task.id}
              cardFields={cardFields}
              selectionActive={selectionActive}
              isSelected={selectedIds?.has(task.id) ?? false}
              onToggleSelected={onToggleSelected}
              justSettled={settledTaskId === task.id}
            />
          ))}
        </div>

        {/* Dashed accent insertion slot — the drop indicator. Collapsed to 0
            height at rest; lightUp()/dimDown() toggle it via direct DOM so it
            never re-renders the card list. Only opacity transitions. */}
        <div
          ref={slotRef}
          aria-hidden
          className="rounded-lg border-2 border-dashed border-[var(--accent)]"
          style={{
            height: "0px",
            marginTop: "0px",
            opacity: 0,
            overflow: "hidden",
            pointerEvents: "none",
            background: "color-mix(in oklch, var(--accent) 8%, transparent)",
            transition: "opacity 160ms ease-out",
          }}
        />

        {/* No hairline above the composer — the borderless well keeps its
            structure through spacing alone (craft-ui-v2). */}
        <div className="mt-2 pt-1">
          <TaskCreateInline
            status={status}
            onCreateTask={onCreateTask}
            onStartCreate={onStartCreate}
          />
        </div>
      </div>
    </div>
  );
});
