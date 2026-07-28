"use client";

import { updateTaskStatus } from "@/app/actions/tasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { KanbanColumn } from "./KanbanColumn";
import { type CardFields, DEFAULT_CARD_FIELDS, TaskCard } from "./TaskCard";
import { TaskCreateInline } from "./TaskCreateInline";
import { STATUS_DOT, type TaskStatus as Status } from "./status";
import type { TasksOptimisticDispatch } from "./TasksClient";

const CARD_FIELDS_KEY = "tasks-card-fields";
const CARD_FIELD_LABELS: { key: keyof CardFields; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "dueDate", label: "Due date" },
  { key: "project", label: "Project(s)" },
];

// All five statuses — used for grouping. "not started" is rendered above the
// kanban in a separate tray, so it's excluded from the column render order.
const ALL_STATUSES: Status[] = ["not started", "up next", "in progress", "almost done", "lesno"];
const COLUMN_ORDER: Status[] = ["up next", "in progress", "almost done", "lesno"];

interface Props {
  tasks: TaskWithProjects[];
  userId: string;
  onTaskClick: (id: string) => void;
  onCreateTask: (input: { title: string; status: Status }) => Promise<void>;
  /** Opens the detail panel as a draft for the given column (Add task flow). */
  onStartCreate?: (status: Status) => void;
  addOptimistic: TasksOptimisticDispatch;
  /**
   * Which property pills show on cards. When the page owns this preference
   * (TasksClient's display menu) it passes the state down and the board
   * renders no toolbar of its own. When absent (ProjectTasksSection), the
   * board falls back to its internal localStorage-backed state + popover, so
   * existing consumers keep working unchanged.
   */
  cardFields?: CardFields;
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
  userId: _userId,
  onTaskClick,
  onCreateTask,
  onStartCreate,
  addOptimistic,
  cardFields: cardFieldsProp,
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
  // Id of the card that just landed in a column, for the drop success-moment
  // spring. Cleared shortly after so the pop plays once. A single state set
  // post-drop (not per dragover) keeps this off the jank path.
  const [settledTaskId, setSettledTaskId] = useState<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markSettled = (id: string) => {
    setSettledTaskId(id);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(
      () => setSettledTaskId((cur) => (cur === id ? null : cur)),
      450
    );
  };
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);
  // Internal card-fields fallback for consumers that do not pass the prop.
  const [internalCardFields, setInternalCardFields] = useState<CardFields>(DEFAULT_CARD_FIELDS);
  const cardFields = cardFieldsProp ?? internalCardFields;

  // Persist tray expanded state across reloads.
  useEffect(() => {
    const stored = localStorage.getItem("tasks-tray-expanded");
    if (stored === "false") setTrayExpanded(false);
    if (!cardFieldsProp) {
      const fields = localStorage.getItem(CARD_FIELDS_KEY);
      if (fields) {
        try {
          setInternalCardFields({ ...DEFAULT_CARD_FIELDS, ...JSON.parse(fields) });
        } catch {
          /* ignore malformed persisted value */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    localStorage.setItem("tasks-tray-expanded", String(trayExpanded));
  }, [trayExpanded]);
  useEffect(() => {
    if (!cardFieldsProp) localStorage.setItem(CARD_FIELDS_KEY, JSON.stringify(internalCardFields));
  }, [internalCardFields, cardFieldsProp]);

  // Memoized: five stable arrays per `tasks` identity, not five fresh arrays
  // per render (every column re-rendered on any board state change before).
  const tasksByStatus = useMemo(
    () =>
      ALL_STATUSES.reduce<Record<Status, TaskWithProjects[]>>(
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
      ),
    [tasks]
  );

  const draggedTask = draggedTaskId ? (tasks.find((t) => t.id === draggedTaskId) ?? null) : null;
  const internalDraggedFromStatus: Status | null = draggedTask
    ? (draggedTask.status as Status)
    : null;
  const draggedFromStatus = externalDraggedFromStatus ?? internalDraggedFromStatus;

  function dropTaskOnStatus(targetStatus: Status) {
    // External drop pipe — parent owns task lookup + dueDate side-effects.
    if (onExternalDropOnStatus) {
      if (externalDraggedTaskId && externalDraggedFromStatus !== targetStatus) {
        markSettled(externalDraggedTaskId);
      }
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
    markSettled(taskId);

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
      // The Realtime echo invalidates the tasks cache; the optimistic overlay
      // holds the move until canonical catches up. One drag, one refetch.
      if (r.data.becameLesno) toast("Lesno.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Card-fields popover, only for consumers that have no page-level
          display menu (the page passes cardFields and this row disappears). */}
      {!cardFieldsProp && (
        <div className="flex items-center justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 cursor-pointer-always",
                  "text-meta text-[var(--ink-muted)]",
                  "transition-colors duration-[160ms] ease-out",
                  "hover:bg-[var(--hover)] hover:text-[var(--ink)]",
                  "data-[state=open]:bg-[var(--selected)] data-[state=open]:text-[var(--ink)]"
                )}
              >
                <SlidersHorizontal size={14} strokeWidth={1.75} />
                Display
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 rounded-xl border-[var(--edge)] p-2">
              <p className="px-2 pb-1.5 text-micro font-medium text-[var(--ink-faint)]">
                Show on cards
              </p>
              <div className="flex flex-col">
                {CARD_FIELD_LABELS.map(({ key, label }) => {
                  const on = cardFields[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setInternalCardFields((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      aria-pressed={on}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 cursor-pointer-always",
                        "text-meta text-[var(--ink)] transition-colors duration-[160ms] ease-out",
                        "hover:bg-[var(--hover)]"
                      )}
                    >
                      {label}
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-sm border transition-colors duration-[160ms]",
                          on
                            ? "border-[var(--edge-strong)] bg-[var(--selected)] text-[var(--ink)]"
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
      )}

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
        settledTaskId={settledTaskId}
      />

      <div className="flex flex-col gap-3 pb-4 @4xl/main:flex-row @4xl/main:items-stretch @4xl/main:gap-4">
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
            settledTaskId={settledTaskId}
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
  settledTaskId?: string | null;
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
  settledTaskId,
}: TrayProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Direct-DOM drop affordance (matches the column): on a valid drag-over the
  // tray washes to --selected and gains a dashed accent outline. outline (not
  // border) avoids any layout shift; no React state.
  const isValidTargetFn = (): boolean =>
    draggedTaskId !== null && draggedFromStatus !== "not started";
  const lightUp = () => {
    if (!ref.current) return;
    ref.current.style.background = "var(--selected)";
    ref.current.style.outline = "2px dashed var(--accent)";
    ref.current.style.outlineOffset = "-2px";
  };
  const dimDown = () => {
    if (!ref.current) return;
    ref.current.style.background = "var(--surface)";
    ref.current.style.outline = "none";
  };
  const trayIds = tasks.map((t) => t.id);
  const selectedInTray = selectedIds ? trayIds.filter((id) => selectedIds.has(id)).length : 0;
  const allSelected = trayIds.length > 0 && selectedInTray === trayIds.length;

  return (
    <div
      ref={ref}
      className="rounded-xl"
      data-status="not started"
      onDragOver={(e) => {
        if (!isValidTargetFn()) return;
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
        if (isValidTargetFn()) onDropOnTray();
      }}
      // Recessed --surface well matching the columns; fill, no border.
      style={{ background: "var(--surface)", transition: "background-color 160ms ease-out" }}
    >
      <div className="group/trayhdr flex items-center gap-2 px-4 pt-3 pb-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 cursor-pointer items-center gap-2"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-[var(--ink-muted)] transition-transform duration-[160ms]",
              !expanded && "-rotate-90"
            )}
          />
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: STATUS_DOT["not started"] }}
          />
          <span className="truncate text-meta font-medium text-[var(--ink)]">Not started</span>
          <span className="shrink-0 text-micro tabular-nums text-[var(--ink-faint)]">
            {tasks.length}
          </span>
        </button>
        {onToggleColumnSelection && tasks.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggleColumnSelection("not started", trayIds)}
            className={cn(
              "ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-micro font-medium cursor-pointer-always transition-opacity duration-[160ms]",
              allSelected
                ? "bg-[var(--selected)] text-[var(--ink)] opacity-100"
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
        <div className="flex min-h-[44px] flex-wrap gap-2 px-3 pb-3">
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
                justSettled={settledTaskId === task.id}
              />
            </div>
          ))}
          <div className="flex w-[280px] items-center">
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
