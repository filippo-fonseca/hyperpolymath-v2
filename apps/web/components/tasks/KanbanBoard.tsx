"use client";

import { updateTaskStatus } from "@/app/actions/tasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { KanbanColumn } from "./KanbanColumn";
import { type CardFields, DEFAULT_CARD_FIELDS, TaskCard } from "./TaskCard";
import { TaskCreateInline } from "./TaskCreateInline";
import type { TasksOptimisticDispatch } from "./TasksClient";

type Status = "not started" | "up next" | "in progress" | "almost done" | "lesno";

const CARD_FIELDS_KEY = "tasks-card-fields";
const CARD_FIELD_LABELS: { key: keyof CardFields; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "dueDate", label: "Due date" },
  { key: "project", label: "Project(s)" },
];

// All five statuses — used for grouping. "not started"is rendered above the
// kanban in a separate tray, so it's excluded from the column render order.
const ALL_STATUSES: Status[] = ["not started", "up next", "in progress", "almost done", "lesno"];
const COLUMN_ORDER: Status[] = ["up next", "in progress", "almost done", "lesno"];

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
  /** Opens the detail panel as a draft for the given column (Add task flow). */
  onStartCreate?: (status: Status) => void;
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
  onStartCreate,
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
  // Which property pills show on each task card. Persisted so the user's
  // view preferences survive reloads. Shared by the tasks page + project page.
  const [cardFields, setCardFields] = useState<CardFields>(DEFAULT_CARD_FIELDS);

  // Persist tray expanded state across reloads.
  useEffect(() => {
    const stored = localStorage.getItem("tasks-tray-expanded");
    if (stored === "false") setTrayExpanded(false);
    const fields = localStorage.getItem(CARD_FIELDS_KEY);
    if (fields) {
      try {
        setCardFields({ ...DEFAULT_CARD_FIELDS, ...JSON.parse(fields) });
      } catch {
        /* ignore malformed persisted value */
      }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("tasks-tray-expanded", String(trayExpanded));
  }, [trayExpanded]);
  useEffect(() => {
    localStorage.setItem(CARD_FIELDS_KEY, JSON.stringify(cardFields));
  }, [cardFields]);

  const tasksByStatus = ALL_STATUSES.reduce<Record<Status, TaskWithProjects[]>>(
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
    }
  );

  const draggedTask = draggedTaskId ? (tasks.find((t) => t.id === draggedTaskId) ?? null) : null;
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
        addOptimistic({ type: "revert", id: taskId });
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
    <div className="flex flex-col gap-4">
      {/* Board toolbar — view settings (which property pills show on cards). */}
      <div className="flex items-center justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 cursor-pointer-always",
                "font-mono text-[11px] uppercase tracking-[0.08em] border border-[var(--edge)]",
                "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]",
                "bg-[var(--surface)] transition-colors duration-150 ease-out"
              )}
            >
              <SlidersHorizontal size={12} strokeWidth={1.5} />
              View
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-2">
            <p className="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              Show on cards
            </p>
            <div className="flex flex-col">
              {CARD_FIELD_LABELS.map(({ key, label }) => {
                const on = cardFields[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCardFields((prev) => ({ ...prev, [key]: !prev[key] }))}
                    aria-pressed={on}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 cursor-pointer-always",
                      "font-sans text-[13px] transition-colors duration-150 ease-out",
                      "text-[var(--ink)] hover:bg-[var(--surface)]"
                    )}
                  >
                    {label}
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                        on
                          ? "border-[var(--edge-hud)] bg-[var(--surface-raised)] text-[var(--ink)]"
                          : "border-[var(--edge)] text-transparent"
                      )}
                    >
                      <Check size={11} strokeWidth={2.5} />
                    </span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <NotStartedTray
        tasks={tasksByStatus["not started"]}
        expanded={trayExpanded}
        onToggle={() => setTrayExpanded((v) => !v)}
        onCreateTask={onCreateTask}
        onStartCreate={onStartCreate}
        onTaskClick={onTaskClick}
        cardFields={cardFields}
        draggedTaskId={draggedTaskId}
        draggedFromStatus={draggedFromStatus}
        onDragStart={setDraggedTaskId}
        onDragEnd={() => setDraggedTaskId(null)}
        onDropOnTray={() => dropTaskOnStatus("not started")}
        selectionActive={selectionActive}
        selectedIds={selectedIds}
        onToggleSelected={onToggleSelected}
        onToggleColumnSelection={onToggleColumnSelection}
      />

      <div className="flex flex-col @4xl/main:flex-row gap-3 @4xl/main:gap-4 pb-4 pr-2 @4xl/main:items-stretch">
        {COLUMN_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            onTaskClick={onTaskClick}
            onCreateTask={onCreateTask}
            onStartCreate={onStartCreate}
            draggedTaskId={draggedTaskId}
            draggedFromStatus={draggedFromStatus}
            onDragStart={setDraggedTaskId}
            onDragEnd={() => setDraggedTaskId(null)}
            onDropOnColumn={dropTaskOnStatus}
            pendingTaskId={null}
            cardFields={cardFields}
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
  onStartCreate?: (status: Status) => void;
  onTaskClick: (id: string) => void;
  cardFields: CardFields;
  draggedTaskId: string | null;
  draggedFromStatus: Status | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOnTray: () => void;
  selectionActive?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void;
  onToggleColumnSelection?: (status: Status, taskIds: string[]) => void;
}

function NotStartedTray({
  tasks,
  expanded,
  onToggle,
  onCreateTask,
  onStartCreate,
  onTaskClick,
  cardFields,
  draggedTaskId,
  draggedFromStatus,
  onDragStart,
  onDragEnd,
  onDropOnTray,
  selectionActive,
  selectedIds,
  onToggleSelected,
  onToggleColumnSelection,
}: TrayProps) {
  const [isOver, setIsOver] = useState(false);
  const accent = NOT_STARTED_ACCENT;
  const isValidTarget = draggedTaskId !== null && draggedFromStatus !== "not started";
  const showDrop = isOver && isValidTarget;
  const trayIds = tasks.map((t) => t.id);
  const selectedInTray = selectedIds ? trayIds.filter((id) => selectedIds.has(id)).length : 0;
  const allSelected = trayIds.length > 0 && selectedInTray === trayIds.length;

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
            ? `inset 0 0 0 2px ${accent.dot}, inset 0 0 24px ${accent.rim}, var(--glass-raise), var(--glass-drop)`
            : `inset 0 0 0 1px ${accent.rim}, var(--glass-raise), var(--glass-drop)`,
          transition: "box-shadow 160ms ease-out",
          ["--task-card-bg" as string]: accent.cardBg,
        } as React.CSSProperties
      }
    >
      <div className="group/trayhdr flex items-center gap-2 px-4 pt-3 pb-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 cursor-pointer min-w-0"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform shrink-0", !expanded && "-rotate-90")}
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
        {onToggleColumnSelection && tasks.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggleColumnSelection("not started", trayIds)}
            className={cn(
              "ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] cursor-pointer-always transition-opacity",
              allSelected
                ? "bg-[var(--surface-raised)] text-[var(--ink)] opacity-100"
                : selectionActive || selectedInTray > 0
                  ? "text-[var(--ink-muted)] opacity-100 hover:text-[var(--ink)]"
                  : "text-[var(--ink-muted)] opacity-0 group-hover/trayhdr:opacity-100 hover:text-[var(--ink)]"
            )}
            title={allSelected ? "Deselect all in tray" : "Select all in tray"}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        ) : null}
      </div>

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
                cardFields={cardFields}
                isDragging={draggedTaskId === task.id}
                selectionActive={selectionActive}
                isSelected={selectedIds?.has(task.id) ?? false}
                onToggleSelected={onToggleSelected}
              />
            </div>
          ))}
          <div className="w-[280px] flex items-center">
            <TaskCreateInline
              status="not started"
              onCreateTask={onCreateTask}
              onStartCreate={onStartCreate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
