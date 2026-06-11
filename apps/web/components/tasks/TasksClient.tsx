"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useQueryState,
  useQueryStates,
  parseAsArrayOf,
  parseAsString,
} from "nuqs";
import {
  startOfDay,
  isSameDay,
  endOfWeek,
  endOfMonth,
  isAfter,
  isBefore,
} from "date-fns";
import { toast } from "sonner";
import {
  createTask,
  getTasksForCurrentUser,
  bulkUpdateTaskDueDate,
  updateTask,
} from "@/app/actions/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";
import { KanbanBoard } from "./KanbanBoard";
import { TaskList } from "./TaskList";
import { TaskDayView } from "./TaskDayView";
import { TaskFilters } from "./TaskFilters";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { KanbanDayHeader } from "./KanbanDayHeader";
import { TaskSelectionBar } from "./TaskSelectionBar";
import { fromYmd, toYmd } from "@/lib/tasks/date-shortcuts";
import { AnimatePresence, motion } from "motion/react";
import { TaskCard } from "./TaskCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { useUndoToast } from "@/components/shared/use-undo-toast";
import { deleteTask } from "@/app/actions/tasks";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

type TaskStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

interface Props {
  userId: string;
  initialTasks: TaskWithProjects[];
  projects: {
    id: string;
    name: string;
    isClass: boolean;
    courseCode: string | null;
  }[];
  initialFilters: {
    priority: string[];
    status: string[];
    due: string[];
    project: string[];
  };
}

export type TasksOptimisticDispatch = (
  action: OptimisticAction<TaskWithProjects>,
) => void;

/**
 * /tasks orchestrator — Phase 3 realtime + useOptimistic.
 *
 * Pattern (D-04 / D-06 / D-09):
 *   1. `useQuery({ queryKey: tableKey("tasks", userId), initialData })` —
 *      TanStack Query owns the canonical tasks cache, hydrated from SSR.
 *   2. `useTableSubscription("tasks", userId)` + `useTableSubscription("tasks_projects", userId)`
 *      — Realtime echoes invalidate the cache → refetch via queryFn.
 *   3. `useOptimistic(tasks, optimisticReducer)` — instant local feedback for
 *      writes. The Realtime echo carries the same caller-supplied UUID, so
 *      the reducer's "insert"no-ops on echo (RT-05 dedupe).
 *
 * D-02: no opacity dim / spinner / pending chrome on optimistic surfaces.
 * D-05: no toast/badge on Realtime invalidation (silent cross-device sync).
 * D-03: server rejection → toast.error + silent revert (useOptimistic reverts
 *       automatically when the transition closes without committing real state).
 */
export function TasksClient({
  userId,
  initialTasks,
  projects,
  initialFilters,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  // Phase 6 Plan 06-02: sonner Undo toast helper for delete-task flow (RES-02).
  const { show: showUndoToast } = useUndoToast();

  // ── Canonical cache (D-06 hybrid SSR + TanStack Query) ───────────────────
  const { data: tasks = initialTasks } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    initialData: initialTasks,
  });

  // ── Realtime subscriptions (RT-01 singleton; D-08) ───────────────────────
  // tasks: primary table
  // tasks_projects: junction — flipping a task's project links from anywhere
  // also refreshes /tasks since project chips render in cards
  useTableSubscription("tasks", userId);
  useTableSubscription("tasks_projects", userId);

  // ── Optimistic overlay (D-04 React 19) ───────────────────────────────────
  const [optimisticTasks, addOptimistic] = useOptimistic(
    tasks,
    optimisticReducer<TaskWithProjects>,
  );

  // View toggle — URL ?view= + localStorage fallback (UI-SPEC D-05)
  const [view, setView] = useQueryState(
    "view",
    parseAsString.withDefault("kanban"),
  );

  // Day-aware kanban — URL ?date=YYYY-MM-DD, defaults to today.
  const [dateYmd, setDateYmd] = useQueryState(
    "date",
    parseAsString.withDefault(toYmd(new Date())),
  );

  // Selection state (kanban day view). Cleared on view/date change.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Inbox tray (undated tasks) — collapsed by default.
  const [inboxOpen, setInboxOpen] = useState(false);

  // Reset selection when the active date or view changes — selections are
  // scoped to "what's visible on this surface now."
  useEffect(() => {
    setSelectedIds(new Set());
    setInboxOpen(false);
  }, [dateYmd, view]);

  // Cross-surface drag (Inbox tray → kanban columns + Not-Started tray
  // within KanbanBoard). Lifted to this component so the drag source
  // (Inbox cards rendered here, OUTSIDE KanbanBoard) and the drop target
  // (kanban columns INSIDE KanbanBoard) share state. On drop:
  //   - status → target column
  //   - dueDate → the active day (so a previously-undated inbox task lands
  //     on today's board)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Detail panel — which task is open (URL ?task=<id>)
  const [openTaskId, setOpenTaskId] = useQueryState("task", parseAsString);
  // Draft task — set when the user clicks "+ Add task"in a kanban column.
  // The detail panel opens in create mode with a synthetic empty task; Save
  // calls createTask, Cancel/close discards.
  const [draftStatus, setDraftStatus] = useState<TaskStatus | null>(null);

  // Auto-hide completed "lesno"tasks by default (per user spec). Persisted in
  // localStorage so the choice survives page reloads. Toggle pill sits in the
  // toolbar next to the view switcher.
  const [showLesno, setShowLesno] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowLesno(localStorage.getItem("tasks-show-lesno") === "true");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("tasks-show-lesno", String(showLesno));
  }, [showLesno]);

  // Read the SAME 4 filter dimensions TaskFilters writes — single source of truth via URL.
  const [filters] = useQueryStates(
    {
      priority: parseAsArrayOf(parseAsString).withDefault(
        initialFilters.priority,
      ),
      status: parseAsArrayOf(parseAsString).withDefault(initialFilters.status),
      due: parseAsArrayOf(parseAsString).withDefault(initialFilters.due),
      project: parseAsArrayOf(parseAsString).withDefault(
        initialFilters.project,
      ),
    },
    { shallow: false },
  );

  // localStorage fallback for view (UI-SPEC: localStorage remembers user's last choice)
  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? localStorage.getItem("tasks-view") : null;
    if (
      (stored === "list" || stored === "day") &&
      (!view || view === "kanban")
    ) {
      setView(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tasks-view", view ?? "kanban");
    }
  }, [view]);

  // Blocker 3: CONCRETE filter predicate — date-fns helpers, no stub
  // Filters the OPTIMISTIC tasks so local optimistic inserts/updates flow
  // through immediately.
  const filtered = useMemo(() => {
    return optimisticTasks.filter((t) => {
      // Auto-hide "lesno" (completed) unless the user explicitly opts in OR
      // they've requested lesno via an explicit status filter (that filter
      // takes precedence — the chip wouldn't make sense otherwise).
      if (
        !showLesno &&
        t.status === "lesno" &&
        !filters.status.includes("lesno")
      )
        return false;
      if (
        filters.priority.length > 0 &&
        !filters.priority.includes(t.priority)
      )
        return false;
      if (filters.status.length > 0 && !filters.status.includes(t.status))
        return false;
      if (filters.project.length > 0) {
        const taskProjectIds = t.projects.map((p) => p.id);
        const hasMatch = taskProjectIds.some((pid) =>
          filters.project.includes(pid),
        );
        if (!hasMatch) return false;
      }
      if (filters.due.length > 0) {
        const today = startOfDay(new Date());
        const due = t.dueDate ? startOfDay(new Date(t.dueDate)) : null;
        const matched = filters.due.some((d) => {
          if (d === "no-date") return due === null;
          if (due === null) return false;
          if (d === "today") return isSameDay(due, today);
          if (d === "this-week") {
            const weekEnd = endOfWeek(today, { weekStartsOn: 0 });
            return !isBefore(due, today) && !isAfter(due, weekEnd);
          }
          if (d === "this-month") {
            const monthEnd = endOfMonth(today);
            return !isBefore(due, today) && !isAfter(due, monthEnd);
          }
          if (d === "overdue") {
            return isBefore(due, today) && t.status !== "lesno";
          }
          return false;
        });
        if (!matched) return false;
      }
      return true;
    });
  }, [
    optimisticTasks,
    filters.priority,
    filters.status,
    filters.due,
    filters.project,
    showLesno,
  ]);

  // Day-scoped slice of `filtered` for the kanban (default view). Tasks
  // with a due date matching `dateYmd` show in the columns; undated tasks
  // accumulate in the Inbox tray and never appear in column bodies.
  // Compare YMD strings directly: t.dueDate from the DB is already a
  // YYYY-MM-DD string (drizzle `date` column), and dateYmd is the URL
  // YMD string. Round-tripping through Date introduces UTC-midnight
  // drift in negative-UTC timezones (a task created today as "today"in
  // EDT would parse to UTC midnight, which is yesterday in EDT, and
  // never match the day filter — that's why new tasks were falling
  // through to the Inbox tray instead of landing in the active column).
  const activeDate = useMemo(() => fromYmd(dateYmd), [dateYmd]);
  const dayFilteredTasks = useMemo(
    () => filtered.filter((t) => t.dueDate === dateYmd),
    [filtered, dateYmd],
  );
  const inboxTasks = useMemo(
    () => filtered.filter((t) => !t.dueDate && t.status !== "lesno"),
    [filtered],
  );

  // Multi-select helpers
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleColumnSelection = useCallback(
    (_status: TaskStatus, taskIds: string[]) => {
      setSelectedIds((prev) => {
        const allSelected = taskIds.every((id) => prev.has(id));
        const next = new Set(prev);
        if (allSelected) {
          for (const id of taskIds) next.delete(id);
        } else {
          for (const id of taskIds) next.add(id);
        }
        return next;
      });
    },
    [],
  );
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkMove = useCallback(
    async (newDueDate: string | null) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      // Optimistic — update each row's dueDate immediately so the cards
      // disappear from the current day view (or land in Inbox if cleared).
      startTransition(() => {
        for (const id of ids) {
          addOptimistic({
            type: "update",
            id,
            patch: { dueDate: newDueDate },
          });
        }
      });
      const r = await bulkUpdateTaskDueDate({ ids, dueDate: newDueDate });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: tableKey("tasks", userId),
      });
      const tail =
        newDueDate === null
          ? "moved to Inbox"
          : `moved to ${newDueDate}`;
      toast.success(`${ids.length} task${ids.length === 1 ? "" : "s"} ${tail}`);
      clearSelection();
    },
    [selectedIds, addOptimistic, queryClient, userId, clearSelection, startTransition],
  );

  const draggedTask = useMemo(
    () => (draggedTaskId ? optimisticTasks.find((t) => t.id === draggedTaskId) ?? null : null),
    [draggedTaskId, optimisticTasks],
  );
  const draggedFromStatus = draggedTask ? (draggedTask.status as TaskStatus) : null;

  const handleKanbanDrop = useCallback(
    async (targetStatus: TaskStatus) => {
      const t = draggedTask;
      setDraggedTaskId(null);
      if (!t) return;
      const needsStatus = t.status !== targetStatus;
      const needsDate = t.dueDate !== dateYmd;
      if (!needsStatus && !needsDate) return;
      startTransition(() => {
        addOptimistic({
          type: "update",
          id: t.id,
          patch: {
            ...(needsStatus ? { status: targetStatus } : {}),
            ...(needsDate ? { dueDate: dateYmd } : {}),
          },
        });
      });
      const r = await updateTask({
        id: t.id,
        ...(needsStatus ? { status: targetStatus } : {}),
        ...(needsDate ? { dueDate: dateYmd } : {}),
      });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: tableKey("tasks", userId),
      });
    },
    [draggedTask, dateYmd, activeDate, addOptimistic, queryClient, userId],
  );

  async function handleCreateTask(input: {
    title: string;
    status: TaskStatus;
  }) {
    // RT-05: client-generated UUID flows through to the server so the
    // Realtime echo arrives with the same id (no-op in the reducer).
    const newId = crypto.randomUUID();
    // Default the new task's due date to the day shown in the kanban
    // header AND the status to whichever column the inline composer was
    // in. Both come from props/state and require no extra UI affordance —
    // matches the muscle-memory expectation that "the column I click is
    // the column it lands in"and "today's tasks land on today."
    const defaultedDueDate = dateYmd;
    startTransition(async () => {
      // Optimistic insert FIRST — UI flips instantly
      addOptimistic({
        type: "insert",
        row: {
          id: newId,
          title: input.title,
          notes: null,
          priority: "P3",
          status: input.status,
          dueDate: defaultedDueDate,
          kanbanPosition: 0,
          completedAt: null,
          createdAt: new Date(),
          projects: [],
        },
      });
      const r = await createTask({
        id: newId,
        title: input.title,
        status: input.status,
        dueDate: defaultedDueDate,
        projectIds: [],
      });
      if (!r.success) {
        // D-03: silent revert + toast.error
        toast.error(r.error);
        return;
      }
      // Belt-and-suspenders: explicit invalidate so the canonical cache catches
      // up BEFORE the transition closes (and useOptimistic reverts). Without
      // this, a slow/failed Realtime echo means the optimistic row disappears
      // and the user has to refresh to see their new task. Realtime stays for
      // cross-device sync; local case is now guaranteed.
      await queryClient.invalidateQueries({
        queryKey: tableKey("tasks", userId),
      });
      toast("Task added.");
    });
  }

  const openTask = openTaskId
    ? optimisticTasks.find((t) => t.id === openTaskId) ?? null
    : null;

  // Synthetic draft for create mode. id stays constant so React doesn't
  // re-init the form between toggles; the panel skips the syncing useEffect
  // anyway by checking task?.id. Dates/projects default to sensible values.
  const draftTask: TaskWithProjects | null = draftStatus
    ? {
        id: "__draft__",
        title: "",
        notes: null,
        priority: "P3",
        status: draftStatus,
        dueDate: dateYmd,
        kanbanPosition: 0,
        completedAt: null,
        createdAt: new Date(),
        projects: [],
      }
    : null;

  const hasActiveFilters =
    filters.priority.length > 0 ||
    filters.status.length > 0 ||
    filters.due.length > 0 ||
    filters.project.length > 0;

  // Arc-redesign: lightweight stats for the page header so the user gets
  // a glance-able sense of load without leaving /tasks. Computed locally
  // from the same `tasks` list the body renders.
  const headerStats = useMemo(() => {
    const today = startOfDay(new Date());
    const open = tasks.filter((t) => t.status !== "lesno");
    const overdue = open.filter(
      (t) => t.dueDate && isBefore(new Date(t.dueDate), today),
    ).length;
    return {
      open: open.length,
      overdue,
      done: tasks.length - open.length,
    };
  }, [tasks]);

  return (
    // No max-w cap — kanban view needs full horizontal real estate for the
    // 5 status columns. Header + toolbar happily extend to the page edge.
    <div className="flex flex-col h-screen min-h-0 overflow-hidden px-8 py-10 w-full">
      {/* Arc-redesign page header — serif title + glance stats row. */}
      <header className="mb-6 space-y-1.5">
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)]">
          Tasks
        </h1>
        <p className="font-serif text-base text-[var(--ink-muted)] flex items-center gap-3">
          <span>
            {headerStats.open} open
            {headerStats.overdue > 0 ? (
              <span className="ml-1.5 text-[var(--ink-coral)]">
                · {headerStats.overdue} overdue
              </span>
            ) : null}
          </span>
          {headerStats.done > 0 ? (
            <span className="text-[var(--ink-muted)]/60">
              · {headerStats.done} done
            </span>
          ) : null}
        </p>
      </header>

      {/* Toolbar: filters + view toggle wrapped in a glassy pill container
          (matches the PROFILE pill in /settings nav — translucent surface +
          backdrop-blur + inset cyan glow + soft outer halo + thin cyan-tinged
          border on hover). */}
      <div
        className={cn(
          "flex items-center justify-between gap-4 mb-5 rounded-xl px-3 py-2 ",
          "",
          "glass-tile",
          "",
          "",
          "",
          "",
        )}
      >
        <TaskFilters projects={projects} />
        {/* Show / hide completed "lesno"tasks. Off by default per user spec —
            the kanban + list + day views all read from `filtered`, which
            drops lesno when this is false. */}
        <button
          type="button"
          onClick={() => setShowLesno((v) => !v)}
          aria-pressed={showLesno}
          className={cn(
            "px-2.5 py-0.5 rounded-md font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer transition-colors duration-150 ease-out border shrink-0",
            showLesno
              ? "border-[var(--edge)] bg-[var(--surface-raised)] text-[var(--ink)]"
              : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge)]",
          )}
          title={showLesno ? "Hide completed (lesno) tasks" : "Show completed (lesno) tasks"}
        >
          {showLesno ? "Hide lesno" : "Show lesno"}
        </button>
        <div className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)] shrink-0">
          {(["kanban", "list", "day"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn(
                "px-2.5 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer",
                "transition-colors duration-150 ease-out",
                view === v
                  ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--edge)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Content area — Phase 6 Plan 06-02 (RES-03, AES-04) empty states */}
      {filtered.length === 0 && hasActiveFilters ? (
        // Filter empty (UI-SPEC §9: "Nothing matches.")
        <EmptyState
          heading="Nothing matches."
          body="Adjust the filters or clear them all."
          action={{ label: "Clear filters", onClick: () => router.push("/tasks") }}
        />
      ) : tasks.length === 0 && !hasActiveFilters ? (
        // True empty — no tasks at all (UI-SPEC §9: "Nothing needs doing.")
        <EmptyState
          heading="Nothing needs doing."
          body="Which probably means you've handled everything. JARVIS is waiting if that changes."
          action={{
            label: "Tell JARVIS",
            onClick: () => {
              window.location.href = "/today";
            },
          }}
        />
      ) : view === "list" ? (
        <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
          <TaskList
            tasks={filtered}
            onTaskClick={setOpenTaskId}
            addOptimistic={addOptimistic}
          />
        </div>
      ) : view === "day" ? (
        <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
          <TaskDayView tasks={filtered} onTaskClick={setOpenTaskId} />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col">
          <KanbanDayHeader
            dateYmd={dateYmd}
            onDateChange={(ymd) => void setDateYmd(ymd)}
            inboxCount={inboxTasks.length}
            inboxOpen={inboxOpen}
            onInboxToggle={() => setInboxOpen((v) => !v)}
          />
          <AnimatePresence initial={false}>
            {inboxOpen ? (
              <motion.div
                key="inbox-tray"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                className="overflow-hidden"
              >
                <div
                  className={cn(
                    "mb-4 rounded-xl p-3 ",
                    "",
                    "glass-tile",
                    "",
                    "",
                    "",
                    "",
                  )}
                  role="region"
                  aria-label="Tasks without a due date"
                >
                  <div className="mb-2 flex items-center justify-between px-1">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                      Inbox · undated
                    </p>
                    <p className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
                      {inboxTasks.length}
                    </p>
                  </div>
                  {inboxTasks.length === 0 ? (
                    <p className="px-1 pb-1 font-serif text-sm text-[var(--ink-muted)]">
                      Inbox is empty.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {inboxTasks.slice(0, 24).map((t) => (
                        <div key={t.id} className="min-w-[220px] max-w-[260px] flex-1">
                          <TaskCard
                            task={t}
                            onClick={setOpenTaskId}
                            draggable
                            onDragStart={(id) => setDraggedTaskId(id)}
                            onDragEnd={() => setDraggedTaskId(null)}
                            isDragging={draggedTaskId === t.id}
                            selectionActive={selectedIds.size > 0}
                            isSelected={selectedIds.has(t.id)}
                            onToggleSelected={(id) => toggleSelected(id)}
                          />
                        </div>
                      ))}
                      {inboxTasks.length > 24 ? (
                        <p className="self-center font-mono text-[11px] text-[var(--ink-muted)]">
                          +{inboxTasks.length - 24} more — open the List view to see all.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <KanbanBoard
            tasks={dayFilteredTasks}
            userId={userId}
            onTaskClick={setOpenTaskId}
            onCreateTask={handleCreateTask}
            onStartCreate={(s) => setDraftStatus(s)}
            addOptimistic={addOptimistic}
            selectionActive={selectedIds.size > 0}
            selectedIds={selectedIds}
            onToggleSelected={(id) => toggleSelected(id)}
            onToggleColumnSelection={toggleColumnSelection}
            externalDraggedTaskId={draggedTaskId}
            externalDraggedFromStatus={draggedFromStatus}
            onExternalDragStart={(id) => setDraggedTaskId(id)}
            onExternalDragEnd={() => setDraggedTaskId(null)}
            onExternalDropOnStatus={(s) => void handleKanbanDrop(s as TaskStatus)}
          />
        </div>
      )}

      <TaskSelectionBar
        count={selectedIds.size}
        onMoveTo={(d) => void handleBulkMove(d)}
        onClear={clearSelection}
        pending={false}
      />

      {/* Detail panel — RES-02: delete passes through useUndoToast for 5s Undo */}
      <TaskDetailPanel
        task={openTask}
        projects={projects}
        open={!!openTask}
        onClose={() => setOpenTaskId(null)}
        addOptimistic={addOptimistic}
        onDeleteTask={(task) => {
          // 1. Optimistic remove — flips UI instantly (D-02)
          addOptimistic({ type: "delete", id: task.id });
          // 2. Toast with 5s Undo (RES-02 / UI-SPEC §8h)
          showUndoToast({
            message: `"${task.title}"deleted`,
            optimisticRemove: () => {
              /* already done above */
            },
            commit: async () => {
              const r = await deleteTask(task.id);
              if (!r.success) {
                toast.error(r.error);
                // Server rejected the delete — restore the row.
                startTransition(() => {
                  addOptimistic({ type: "insert", row: task });
                });
                return;
              }
              // Belt-and-suspenders refetch (matches create/status-change).
              await queryClient.invalidateQueries({
                queryKey: tableKey("tasks", userId),
              });
            },
            undo: () => {
              /* Server delete only fires on commit; nothing server-side to roll back */
            },
            addBack: () =>
              startTransition(() => {
                addOptimistic({ type: "insert", row: task });
              }),
          });
        }}
      />

      {/* Draft panel — opens when the user clicks "+ Add task"in a column. */}
      <TaskDetailPanel
        task={draftTask}
        projects={projects}
        open={!!draftTask}
        onClose={() => setDraftStatus(null)}
        addOptimistic={addOptimistic}
        mode="create"
      />
    </div>
  );
}
