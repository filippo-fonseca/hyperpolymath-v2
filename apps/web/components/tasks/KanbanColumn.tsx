"use client";

import { useRef } from "react";
import { AnimatePresence } from "motion/react";
import { TaskCard } from "./TaskCard";
import { TaskCreateInline } from "./TaskCreateInline";
import { cn } from "@/lib/utils";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

type TaskStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

const STATUS_LABELS: Record<TaskStatus, string> = {
  "not started": "Not Started",
  "up next": "Up Next",
  "in progress": "In Progress",
  "almost done": "Almost Done",
  lesno: "Lesno",
};

// Each status gets a vibrant hue (the dot). bg, rim, and cardBg are
// derived from the dot via color-mix against canvas/surface tokens so
// they adapt automatically to light vs dark mode — no hardcoded dark
// OKLCH lightness values (which were the previous design and turned
// into murky dark blocks on the light parchment canvas).
const STATUS_ACCENT: Record<TaskStatus, { dot: string }> = {
  "not started": { dot: "oklch(0.72 0.02 80)" },
  "up next":     { dot: "oklch(0.78 0.16 80)" },
  "in progress": { dot: "oklch(0.74 0.16 240)" },
  "almost done": { dot: "oklch(0.78 0.16 305)" },
  lesno:         { dot: "oklch(0.78 0.18 160)" },
};

function deriveAccent(dot: string) {
  return {
    dot,
    // Light wash of the hue against the canvas. ~12% hue mix gives a
    // tint you can read but doesn't drown the cards.
    bg: `color-mix(in oklch, var(--canvas) 88%, ${dot})`,
    // Slightly more saturated for the inset border.
    rim: `color-mix(in oklch, var(--edge) 55%, ${dot})`,
    // Card background sits just above the column wash.
    cardBg: `color-mix(in oklch, var(--surface-raised) 90%, ${dot})`,
  };
}

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
  /** Selection plumbing — when supplied, cards render their checkbox and
   * the column header gets a "select all in column" toggle. */
  selectionActive?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void;
  onToggleColumnSelection?: (status: TaskStatus, taskIds: string[]) => void;
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
  selectionActive,
  selectedIds,
  onToggleSelected,
  onToggleColumnSelection,
}: Props) {
  const taskIds = tasks.map((t) => t.id);
  const selectedInColumn = selectedIds
    ? taskIds.filter((id) => selectedIds.has(id)).length
    : 0;
  const allSelected = taskIds.length > 0 && selectedInColumn === taskIds.length;
  const ref = useRef<HTMLDivElement>(null);
  const accent = deriveAccent(STATUS_ACCENT[status].dot);

  const restingShadow = `inset 0 0 0 1px ${accent.rim}`;
  const hoverShadow = `inset 0 0 0 2px ${accent.dot}, inset 0 0 24px ${accent.rim}`;

  // v1 pattern: drop-target affordance via direct DOM mutation, NOT React state.
  // Setting React state on every dragover triggers a re-render of the column +
  // its task cards, which competes with Motion's layout animation on drop and
  // produces a visible "recoil" snap. Mutating boxShadow on the DOM node bypasses
  // React entirely — the affordance lights up instantly, no churn on the children.
  const isValidTarget = (): boolean =>
    draggedTaskId !== null && draggedFromStatus !== status;

  const lightUp = () => {
    if (ref.current) ref.current.style.boxShadow = hoverShadow;
  };
  const dimDown = () => {
    if (ref.current) ref.current.style.boxShadow = restingShadow;
  };

  return (
    <div
      ref={ref}
      className="flex flex-col w-full @lg/main:min-w-[280px] @lg/main:max-w-[320px] @lg/main:flex-shrink-0 rounded-2xl @lg/main:h-full min-h-0"
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
      style={{
        background: accent.bg,
        boxShadow: restingShadow,
        transition: "box-shadow 140ms ease-out",
        ["--task-card-bg" as string]: accent.cardBg,
      } as React.CSSProperties}
    >
      <div className="group/colhdr flex items-center gap-2 px-4 pt-3 pb-2">
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: accent.dot }}
        />
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: accent.dot }}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
          ({tasks.length})
        </span>
        {onToggleColumnSelection && tasks.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggleColumnSelection(status, taskIds)}
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] cursor-pointer-always transition-opacity",
              allSelected
                ? "bg-[var(--surface-raised)] text-[var(--ink)] opacity-100"
                : selectionActive || selectedInColumn > 0
                  ? "text-[var(--ink-muted)] opacity-100 hover:text-[var(--ink)]"
                  : "text-[var(--ink-muted)] opacity-0 group-hover/colhdr:opacity-100 hover:text-[var(--ink)]",
            )}
            title={allSelected ? "Deselect all in column" : "Select all in column"}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        ) : null}
      </div>

      {/* Two-part column body: scrollable task list, pinned "Add task" footer.
          flex-1 + min-h-0 lets the list shrink/scroll inside the column's
          row-stretched height; the footer stays anchored at the bottom. */}
      <div className="flex flex-col flex-1 min-h-0 px-3 pb-3">
        <div className="flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
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
                selectionActive={selectionActive}
                isSelected={selectedIds?.has(task.id) ?? false}
                onToggleSelected={onToggleSelected}
              />
            ))}
          </AnimatePresence>
        </div>

        <div className="mt-2 pt-2 border-t border-[color:color-mix(in_oklch,var(--edge)_50%,transparent)]">
          <TaskCreateInline status={status} onCreateTask={onCreateTask} onStartCreate={onStartCreate} />
        </div>
      </div>
    </div>
  );
}
