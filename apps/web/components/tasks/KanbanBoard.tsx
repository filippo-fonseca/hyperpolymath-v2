"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { updateTaskStatus } from "@/app/actions/tasks";
import { cn } from "@/lib/utils";
import { KanbanColumn } from "./KanbanColumn";
import { PriorityChip } from "./PriorityChip";
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

// Shared accent for the tray (matches KanbanColumn's "not started" entry).
const NOT_STARTED_ACCENT = {
  dot: "oklch(0.72 0.02 80)",
  bg: "oklch(0.21 0.02 80 / 0.55)",
  rim: "oklch(0.42 0.04 80 / 0.6)",
  cardBg: "oklch(0.27 0.03 80 / 0.8)",
};

interface Props {
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  onCreateTask: (input: { title: string; status: Status }) => Promise<void>;
  addOptimistic: TasksOptimisticDispatch;
}

export function KanbanBoard({
  tasks,
  onTaskClick,
  onCreateTask,
  addOptimistic,
}: Props) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
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
  const draggedFromStatus: Status | null = draggedTask
    ? (draggedTask.status as Status)
    : null;

  function dropTaskOnStatus(targetStatus: Status) {
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
      if (r.data.becameLesno) toast("Lesno.");
    });
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
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

      <div className="flex gap-5 overflow-x-auto pb-4 pr-2">
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
        <div className="flex flex-wrap gap-2 px-3 pb-3 min-h-[44px]">
          {tasks.map((task) => (
            <TaskChip
              key={task.id}
              task={task}
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onClick={onTaskClick}
              isDragging={draggedTaskId === task.id}
            />
          ))}
          <div className="min-w-[180px] flex items-center">
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

// ─── Compact task chip used inside the tray ───────────────────────────────

interface ChipProps {
  task: TaskWithProjects;
  draggable?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  onClick: (id: string) => void;
  isDragging?: boolean;
}

function TaskChip({
  task,
  draggable,
  onDragStart,
  onDragEnd,
  onClick,
  isDragging,
}: ChipProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart?.(task.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => onClick(task.id)}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-md select-none max-w-[240px]",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
      style={{
        background: "var(--task-card-bg, var(--surface-raised))",
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <PriorityChip priority={task.priority} />
      <span className="font-serif text-[13px] truncate text-[var(--ink)]">
        {task.title}
      </span>
    </div>
  );
}
