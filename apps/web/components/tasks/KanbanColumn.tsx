"use client";

import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "motion/react";
import { useRef } from "react";
import { type CardFields, TaskCard } from "./TaskCard";
import { TaskCreateInline } from "./TaskCreateInline";

type TaskStatus = "not started" | "up next" | "in progress" | "almost done" | "lesno";

const STATUS_LABELS: Record<TaskStatus, string> = {
  "not started": "Not Started",
  "up next": "Up Next",
  "in progress": "In Progress",
  "almost done": "Almost Done",
  lesno: "Lesno",
};

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
   * the column header gets a "select all in column"toggle. */
  selectionActive?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void;
  onToggleColumnSelection?: (status: TaskStatus, taskIds: string[]) => void;
  /** Id of the card that just settled into a column, so it gets the drop
   * success-moment spring. Threaded down to the matching TaskCard. */
  settledTaskId?: string | null;
}

export function KanbanColumn({
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

  // Drop-target affordance via DIRECT DOM mutation, NOT React state (preserved
  // from the v1 pattern for D1d zero-jank). Setting React state on every
  // dragover re-renders the column + its task cards, which competes with
  // Motion's layout animation on drop and produces a visible recoil snap.
  // Mutating the node's style bypasses React: the column washes to
  // --sd-selected-item and a dashed accent insertion slot fades in — instantly,
  // no churn on the children. Writes are idempotent (dragover fires repeatedly;
  // re-setting identical values is a no-op), and only opacity animates on the
  // slot, so revealing it is a single reflow, never a per-frame height tween.
  const isValidTarget = (): boolean => draggedTaskId !== null && draggedFromStatus !== status;

  const lightUp = () => {
    if (ref.current) ref.current.style.background = "var(--sd-selected-item)";
    if (slotRef.current) {
      slotRef.current.style.height = "2.75rem";
      slotRef.current.style.marginTop = "0.625rem";
      slotRef.current.style.opacity = "1";
    }
  };
  const dimDown = () => {
    if (ref.current) ref.current.style.background = "var(--sd-darker-box)";
    if (slotRef.current) {
      slotRef.current.style.height = "0px";
      slotRef.current.style.marginTop = "0px";
      slotRef.current.style.opacity = "0";
    }
  };

  return (
    <div
      ref={ref}
      className="flex flex-col w-full @4xl/main:flex-1 @4xl/main:basis-0 @4xl/main:min-w-0 rounded-lg border border-[var(--sd-line)]"
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
      // Recessed well (seed §Columns): --sd-darker-box sits below the cards'
      // --sd-box surface in both themes; elevation via the grey ladder + a 1px
      // hairline, no shadow (D7).
      style={{ background: "var(--sd-darker-box)", transition: "background-color 120ms ease-out" }}
    >
      <div className="group/colhdr flex items-center gap-2 px-4 pt-3 pb-2 min-w-0">
        <span className="sd-stat-label truncate">{STATUS_LABELS[status]}</span>
        <span className="inline-flex items-center rounded-full border border-[var(--sd-line)] bg-[var(--sd-box)] px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums text-[var(--sd-ink-dull)] shrink-0">
          {tasks.length}
        </span>
        {onToggleColumnSelection && tasks.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggleColumnSelection(status, taskIds)}
            className={cn(
              "ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] cursor-pointer-always transition-opacity",
              allSelected
                ? "bg-[var(--sd-box)] text-[var(--sd-ink)] opacity-100"
                : selectionActive || selectedInColumn > 0
                  ? "text-[var(--sd-ink-dull)] opacity-100 hover:text-[var(--sd-ink)]"
                  : "text-[var(--sd-ink-dull)] opacity-0 group-hover/colhdr:opacity-100 hover:text-[var(--sd-ink)]"
            )}
            title={allSelected ? "Deselect all in column" : "Select all in column"}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        ) : null}
      </div>

      {/* Two-part column body: task list + "Add task"footer. The whole
          board scrolls at the page level now (no per-column internal scroll),
          so the column grows to its content and the footer follows the list.
          The card list carries the wiki quiet-scrollbar convention so it stays
          in-register if a bounded height is ever introduced. */}
      <div className="flex flex-col px-3 pb-3">
        <div className="custom-scrollbar flex flex-col gap-2.5 pr-1 -mr-1">
          <AnimatePresence mode="popLayout" initial={false}>
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
          </AnimatePresence>
        </div>

        {/* Dashed accent insertion slot — the drop indicator. Collapsed to 0
            height at rest; lightUp()/dimDown() toggle it via direct DOM so it
            never re-renders the card list. Only opacity transitions. */}
        <div
          ref={slotRef}
          aria-hidden
          className="rounded-lg border-2 border-dashed border-[var(--sd-accent)]"
          style={{
            height: "0px",
            marginTop: "0px",
            opacity: 0,
            overflow: "hidden",
            pointerEvents: "none",
            background: "color-mix(in srgb, var(--sd-accent) 8%, transparent)",
            transition: "opacity 120ms ease-out",
          }}
        />

        <div className="mt-2 pt-2 border-t border-[color:color-mix(in_oklch,var(--sd-line)_60%,transparent)]">
          <TaskCreateInline
            status={status}
            onCreateTask={onCreateTask}
            onStartCreate={onStartCreate}
          />
        </div>
      </div>
    </div>
  );
}
