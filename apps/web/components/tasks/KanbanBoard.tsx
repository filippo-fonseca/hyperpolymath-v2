"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { updateTaskStatus } from "@/app/actions/tasks";
import { cn } from "@/lib/utils";
import { tableKey } from "@/lib/realtime/query-keys";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import { TaskCreateInline } from "./TaskCreateInline";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { TasksOptimisticDispatch } from "./TasksClient";

type Status =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

// All five statuses — used for grouping. "not started" is rendered above the
// kanban in a separate tray, so it's excluded from the column render order.
const ALL_STATUSES: Status[] = [
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
];
const COLUMN_ORDER: Status[] = [
  "up next",
  "in progress",
  "almost done",
  "lesno",
];

// Shared accent for the tray. Derived from the dot via color-mix against
// canvas/surface so the tray adapts to light + dark mode (was hardcoded
// dark OKLCH lightness that turned into a murky band in light mode).
const NOT_STARTED_DOT = "oklch(0.72 0.02 80)";
const NOT_STARTED_ACCENT = {
  dot: NOT_STARTED_DOT,
  bg: `color-mix(in oklch, var(--canvas) 88%, ${NOT_STARTED_DOT})`,
  rim: `color-mix(in oklch, var(--edge) 55%, ${NOT_STARTED_DOT})`,
  cardBg: `color-mix(in oklch, var(--surface-raised) 90%, ${NOT_STARTED_DOT})`,
};

interface Props {
  tasks: TaskWithProjects[];
  userId: string;
  onTaskClick: (id: string) => void;
  onCreateTask: (input: { title: string; status: Status }) => Promise<void>;
  addOptimistic: TasksOptimisticDispatch;
  selectionActive?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void;
  onToggleColumnSelection?: (status: Status, taskIds: string[]) => void;
  /** Drag state lifted to the parent so cards outside the kanban (e.g.
   * the Inbox tray) can also be dragged INTO the columns. When supplied,
   * the board uses the parent's drag handlers + drop dispatcher instead
   * of its own internal state. */
  externalDraggedTaskId?: string | null;
  externalDraggedFromStatus?: Status | null;
  onExternalDragStart?: (id: string) => void;
  onExternalDragEnd?: () => void;
  onExternalDropOnStatus?: (target: Status) => void;
}

export function KanbanBoard({
  tasks,
  userId,
  onTaskClick,
  onCreateTask,
  addOptimistic,
  selectionActive,
  selectedIds,
  onToggleSelected,
  onToggleColumnSelection,
  externalDraggedTaskId,
  externalDraggedFromStatus,
  onExternalDragStart,
  onExternalDragEnd,
  onExternalDropOnStatus,
}: Props) {
  const queryClient = useQueryClient();
  const [internalDraggedTaskId, setInternalDraggedTaskId] = useState<string | null>(null);
  const draggedTaskId = externalDraggedTaskId ?? internalDraggedTaskId;
  const setDraggedTaskId = onExternalDragStart
    ? (id: string | null) => {
        if (id) onExternalDragStart(id);
        else onExternalDragEnd?.();
      }
    : setInternalDraggedTaskId;
  const [, startTransition] = useTransition();
  const [trayExpanded, setTrayExpanded] = useState(true);

  // Persist tray expanded state across reloads.
  useEffect(() => {
    const stored = localStorage.getItem("tasks-tray-expanded");
    if (stored === "false") setTrayExpanded(false);
  }, []);
  useEffect(() => {
    localStorage.setItem("tasks-tray-expanded", String(trayExpanded));
  }, [trayExpanded]);

  const tasksByStatus = ALL_STATUSES.reduce<
    Record<Status, TaskWithProjects[]>
  >(
    (acc, s) => {
      acc[s] = tasks.filter((t) => t.status === s);
      return acc;
    },
    {
      "not started": [],
      "up next": [],
      "in progress": [],
      "almost done": [],
      lesno: [],
    },
  );

  const draggedTask = draggedTaskId
    ? tasks.find((t) => t.id === draggedTaskId) ?? null
    : null;
  const internalDraggedFromStatus: Status | null = draggedTask
    ? (draggedTask.status as Status)
    : null;
  const draggedFromStatus = externalDraggedFromStatus ?? internalDraggedFromStatus;

  function dropTaskOnStatus(targetStatus: Status) {
    // External drop pipe — parent owns task lookup + dueDate side-effects.
    if (onExternalDropOnStatus) {
      onExternalDropOnStatus(targetStatus);
      return;
    }
    if (!draggedTask) return;
    if (draggedTask.status === targetStatus) {
      setDraggedTaskId(null);
      return;
    }
    const taskId = draggedTask.id;
    setDraggedTaskId(null);

    startTransition(async () => {
      addOptimistic({
        type: "update",
        id: taskId,
        patch: { status: targetStatus },
      });
      const r = await updateTaskStatus({
        id: taskId,
        newStatus: targetStatus,
      });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      // Belt-and-suspenders: force a TanStack Query refetch so the canonical
      // cache catches up to the DB write BEFORE the transition closes and
      // useOptimistic reverts. Without this, if the Realtime echo lags (or
      // fails — common in dev), the card snaps back to its old column and
      // the user needs to refresh to see the move. Realtime stays as a
      // cross-device sync path; this guarantees the local case.
      await queryClient.invalidateQueries({
        queryKey: tableKey("tasks", userId),
      });
      if (r.data.becameLesno) toast("Lesno.");
    });
  }

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <NotStartedTray
        tasks={tasksByStatus["not started"]}
        expanded={trayExpanded}
        onToggle={() => setTrayExpanded((v) => !v)}
        onCreateTask={onCreateTask}
        onTaskClick={onTaskClick}
        draggedTaskId={draggedTaskId}
        draggedFromStatus={draggedFromStatus}
        onDragStart={setDraggedTaskId}
        onDragEnd={() => setDraggedTaskId(null)}
        onDropOnTray={() => dropTaskOnStatus("not started")}
      />

      <div className="flex gap-5 overflow-x-auto pb-4 pr-2 flex-1 min-h-0 items-stretch">
        {COLUMN_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            onTaskClick={onTaskClick}
            onCreateTask={onCreateTask}
            draggedTaskId={draggedTaskId}
            draggedFromStatus={draggedFromStatus}
            onDragStart={setDraggedTaskId}
            onDragEnd={() => setDraggedTaskId(null)}
            onDropOnColumn={dropTaskOnStatus}
            pendingTaskId={null}
            selectionActive={selectionActive}
            selectedIds={selectedIds}
            onToggleSelected={onToggleSelected}
            onToggleColumnSelection={onToggleColumnSelection}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Not Started tray ─────────────────────────────────────────────────────
// Separate horizontal section that sits above the kanban. Drops onto the tray
// flip status to "not started"; chips drag back out to any kanban column.

interface TrayProps {
  tasks: TaskWithProjects[];
  expanded: boolean;
  onToggle: () => void;
  onCreateTask: (input: { title: string; status: Status }) => Promise<void>;
  onTaskClick: (id: string) => void;
  draggedTaskId: string | null;
  draggedFromStatus: Status | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOnTray: () => void;
}

function NotStartedTray({
  tasks,
  expanded,
  onToggle,
  onCreateTask,
  onTaskClick,
  draggedTaskId,
  draggedFromStatus,
  onDragStart,
  onDragEnd,
  onDropOnTray,
}: TrayProps) {
  const [isOver, setIsOver] = useState(false);
  const accent = NOT_STARTED_ACCENT;
  const isValidTarget =
    draggedTaskId !== null && draggedFromStatus !== "not started";
  const showDrop = isOver && isValidTarget;

  return (
    <div
      className="rounded-2xl"
      data-status="not started"
      onDragOver={(e) => {
        if (!draggedTaskId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        if (isValidTarget) onDropOnTray();
      }}
      style={
        {
          background: accent.bg,
          boxShadow: showDrop
            ? `inset 0 0 0 2px ${accent.dot}, inset 0 0 24px ${accent.rim}`
            : `inset 0 0 0 1px ${accent.rim}`,
          transition: "box-shadow 160ms ease-out",
          ["--task-card-bg" as string]: accent.cardBg,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 pt-3 pb-2 cursor-pointer"
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform shrink-0",
            !expanded && "-rotate-90",
          )}
          style={{ color: accent.dot }}
        />
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: accent.dot }}
        />
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: accent.dot }}
        >
          Not Started
        </span>
        <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
          ({tasks.length})
        </span>
      </button>

      {expanded && (
        <div className="flex flex-wrap gap-2.5 px-3 pb-3 min-h-[44px]">
          {tasks.map((task) => (
            <div key={task.id} className="w-[280px]">
              <TaskCard
                task={task}
                draggable
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onClick={onTaskClick}
                isDragging={draggedTaskId === task.id}
              />
            </div>
          ))}
          <div className="w-[280px] flex items-center">
            <TaskCreateInline
              status="not started"
              onCreateTask={onCreateTask}
            />
          </div>
        </div>
      )}
    </div>
  );
}
