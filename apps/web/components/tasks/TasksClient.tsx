"use client";

import {
  bulkUpdateTaskDueDate,
  createTask,
  getTasksForCurrentUser,
  updateTask,
} from "@/app/actions/tasks";
import { deleteTask } from "@/app/actions/tasks";
import { EmptyState } from "@/components/shared/EmptyState";
import { useUndoToast } from "@/components/shared/use-undo-toast";
import { Button } from "@/components/ui/button";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { type OptimisticAction, optimisticReducer } from "@/lib/realtime/optimistic-reducer";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useTasksExpanded } from "@/lib/ui/useTasksExpanded";
import { fromYmd, toYmd } from "@/lib/tasks/date-shortcuts";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, endOfWeek, isAfter, isBefore, isSameDay, startOfDay } from "date-fns";
import { Maximize2, Minimize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsArrayOf, parseAsString, useQueryState, useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { InboxColumn } from "./InboxColumn";
import { KanbanBoard } from "./KanbanBoard";
import { DaySwitcher } from "./DaySwitcher";
import { TaskOverviewView } from "./TaskOverviewView";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskFilters } from "./TaskFilters";
import { TaskList } from "./TaskList";
import { TaskSelectionBar } from "./TaskSelectionBar";

type TaskStatus = "not started" | "up next" | "in progress" | "almost done" | "lesno";

interface Props {
  userId: string;
  initialTasks: TaskWithProjects[];
  projects: {
    id: string;
    name: string;
    icon: string | null;
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

export type TasksOptimisticDispatch = (action: OptimisticAction<TaskWithProjects>) => void;

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
export function TasksClient({ userId, initialTasks, projects, initialFilters }: Props) {
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
    optimisticReducer<TaskWithProjects>
  );

  // Expand/fullscreen (D-08 / UI-SPEC S-7) — localStorage-backed flag shared
  // with AppShell (which hides the sidebar). Ephemeral, never in the URL.
  const { expanded, toggle: toggleExpanded } = useTasksExpanded();

  // View toggle — URL ?view= + localStorage fallback (UI-SPEC D-05)
  const [view, setView] = useQueryState("view", parseAsString.withDefault("kanban"));

  // Day-aware kanban — URL ?date=YYYY-MM-DD, defaults to today.
  const [dateYmd, setDateYmd] = useQueryState("date", parseAsString.withDefault(toYmd(new Date())));

  // Selection state (kanban day view). Cleared on view/date change.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection when the active date or view changes — selections are
  // scoped to "what's visible on this surface now."
  useEffect(() => {
    setSelectedIds(new Set());
  }, [dateYmd, view]);

  // Cross-surface drag (Inbox tray → kanban columns + Not-Started tray
  // within KanbanBoard). Lifted to this component so the drag source
  // (Inbox cards rendered here, OUTSIDE KanbanBoard) and the drop target
  // (kanban columns INSIDE KanbanBoard) share state. On drop:
  //   - status → target column
  //   - dueDate → the active day (so a previously-undated inbox task lands
  //     on today's board)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  // List-view drop area highlight (cyan glow) while a card hovers over it.
  const [listDragOver, setListDragOver] = useState(false);

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
    if (typeof window !== "undefined") localStorage.setItem("tasks-show-lesno", String(showLesno));
  }, [showLesno]);

  // Hide/unhide the persistent Inbox column. The Inbox is the default anchor,
  // so this starts visible; the choice persists in localStorage like showLesno.
  const [inboxHidden, setInboxHidden] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setInboxHidden(localStorage.getItem("tasks-inbox-hidden") === "true");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("tasks-inbox-hidden", String(inboxHidden));
  }, [inboxHidden]);

  // Read the SAME 4 filter dimensions TaskFilters writes — single source of truth via URL.
  const [filters] = useQueryStates(
    {
      priority: parseAsArrayOf(parseAsString).withDefault(initialFilters.priority),
      status: parseAsArrayOf(parseAsString).withDefault(initialFilters.status),
      due: parseAsArrayOf(parseAsString).withDefault(initialFilters.due),
      project: parseAsArrayOf(parseAsString).withDefault(initialFilters.project),
    },
    { shallow: false }
  );

  // localStorage fallback for view (UI-SPEC: localStorage remembers user's last choice)
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("tasks-view") : null;
    if ((stored === "list" || stored === "overview") && (!view || view === "kanban")) {
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
      // takes precedence — the chip wouldn't make sense otherwise) OR the
      // task is completed on the currently-selected day (D-06): day-scoped
      // views (kanban/list) must keep that day's done work visible rather
      // than having it vanish on completion. The YMD string match keeps
      // the day-survival rule scoped — lesno tasks on OTHER days still
      // obey the global showLesno toggle. Undated lesno tasks never match
      // dateYmd, so the Inbox stays lesno-free regardless.
      if (
        !showLesno &&
        t.status === "lesno" &&
        !filters.status.includes("lesno") &&
        t.dueDate !== dateYmd
      )
        return false;
      if (filters.priority.length > 0 && !filters.priority.includes(t.priority)) return false;
      if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
      if (filters.project.length > 0) {
        const taskProjectIds = t.projects.map((p) => p.id);
        const hasMatch = taskProjectIds.some((pid) => filters.project.includes(pid));
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
  }, [optimisticTasks, filters.priority, filters.status, filters.due, filters.project, showLesno, dateYmd]);

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
    [filtered, dateYmd]
  );
  const inboxTasks = useMemo(
    () => filtered.filter((t) => !t.dueDate && t.status !== "lesno"),
    [filtered]
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
  const toggleColumnSelection = useCallback((_status: TaskStatus, taskIds: string[]) => {
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
  }, []);
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
      const tail = newDueDate === null ? "moved to Inbox" : `moved to ${newDueDate}`;
      toast.success(`${ids.length} task${ids.length === 1 ? "" : "s"} ${tail}`);
      clearSelection();
    },
    [selectedIds, addOptimistic, queryClient, userId, clearSelection, startTransition]
  );

  const draggedTask = useMemo(
    () => (draggedTaskId ? (optimisticTasks.find((t) => t.id === draggedTaskId) ?? null) : null),
    [draggedTaskId, optimisticTasks]
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
    [draggedTask, dateYmd, activeDate, addOptimistic, queryClient, userId]
  );

  // D-04 / TASK-INBOX-02: drop a single card onto the Inbox column → null its
  // due date. Mirrors handleBulkMove's optimistic shape but for the lone
  // dragged card, and REUSES the existing bulkUpdateTaskDueDate server action
  // (no new action — per CONTEXT). Silent optimistic on the single-card path
  // (UI-SPEC I-1): success is its own feedback (card lands in the Inbox); only
  // a failure surfaces a toast.
  const handleInboxDrop = useCallback(async () => {
    const id = draggedTaskId;
    setDraggedTaskId(null);
    if (!id) return;
    const t = optimisticTasks.find((task) => task.id === id);
    // Already undated → nothing to do (dragging an Inbox card back onto itself).
    if (t && !t.dueDate) return;
    startTransition(() => {
      addOptimistic({ type: "update", id, patch: { dueDate: null } });
    });
    const r = await bulkUpdateTaskDueDate({ ids: [id], dueDate: null });
    if (!r.success) {
      toast.error("Couldn't move to Inbox. Try again.");
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: tableKey("tasks", userId),
    });
  }, [draggedTaskId, optimisticTasks, addOptimistic, queryClient, userId, startTransition]);

  // Drop a dragged card onto a specific day (List view drop area → the active
  // day; Overview → the row's day). Forces status to "not started"and sets the
  // due date to the target day, mirroring handleKanbanDrop's optimistic shape.
  const handleDropOnDay = useCallback(
    async (ymd: string) => {
      const t = draggedTask;
      setDraggedTaskId(null);
      if (!t) return;
      const needsStatus = t.status !== "not started";
      const needsDate = t.dueDate !== ymd;
      if (!needsStatus && !needsDate) return;
      startTransition(() => {
        addOptimistic({
          type: "update",
          id: t.id,
          patch: {
            ...(needsStatus ? { status: "not started" } : {}),
            ...(needsDate ? { dueDate: ymd } : {}),
          },
        });
      });
      const r = await updateTask({
        id: t.id,
        ...(needsStatus ? { status: "not started" } : {}),
        ...(needsDate ? { dueDate: ymd } : {}),
      });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: tableKey("tasks", userId),
      });
    },
    [draggedTask, addOptimistic, queryClient, userId, startTransition]
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

  const openTask = openTaskId ? (optimisticTasks.find((t) => t.id === openTaskId) ?? null) : null;

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
    const overdue = open.filter((t) => t.dueDate && isBefore(new Date(t.dueDate), today)).length;
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
      {/* Arc-redesign page header — serif title + glance stats row, with the
          expand/fullscreen toggle anchored top-right (D-08 / UI-SPEC S-7). */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1.5">
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
            <span className="text-[var(--ink-muted)]/60">· {headerStats.done} done</span>
          ) : null}
        </p>
        </div>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={expanded ? "Exit fullscreen" : "Expand tasks to fullscreen"}
          className="text-[var(--ink-muted)] hover:text-[var(--ink)] p-1 rounded cursor-pointer-always transition-colors duration-150 ease-out"
        >
          {expanded ? (
            <Minimize2 size={16} strokeWidth={1.5} />
          ) : (
            <Maximize2 size={16} strokeWidth={1.5} />
          )}
        </button>
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
          ""
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
          disabled={view !== "overview"}
          className={cn(
            "px-2.5 py-0.5 rounded-md font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-150 ease-out border shrink-0",
            view !== "overview"
              ? "border-transparent text-[var(--ink-muted)]/40 cursor-not-allowed"
              : showLesno
                ? "border-[var(--edge)] bg-[var(--surface-raised)] text-[var(--ink)] cursor-pointer"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge)] cursor-pointer"
          )}
          title={
            view !== "overview"
              ? "Completed tasks always show on the selected day"
              : showLesno
                ? "Hide completed (lesno) tasks"
                : "Show completed (lesno) tasks"
          }
        >
          {showLesno ? "Hide lesno" : "Show lesno"}
        </button>
        {/* Hide / show the persistent Inbox column. */}
        <button
          type="button"
          onClick={() => setInboxHidden((v) => !v)}
          aria-pressed={inboxHidden}
          className={cn(
            "px-2.5 py-0.5 rounded-md font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer transition-colors duration-150 ease-out border shrink-0",
            inboxHidden
              ? "border-[var(--edge)] bg-[var(--surface-raised)] text-[var(--ink)]"
              : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge)]"
          )}
          title={inboxHidden ? "Show the Inbox column" : "Hide the Inbox column"}
        >
          {inboxHidden ? "Show inbox" : "Hide inbox"}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {/* Top-level surface: Overview vs. Day. */}
          <div className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)]">
            {([
              { value: "overview", label: "overview", active: view === "overview" },
              { value: "day", label: "day", active: view !== "overview" },
            ] as const).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() =>
                  setView(t.value === "overview" ? "overview" : view === "overview" ? "kanban" : view)
                }
                aria-pressed={t.active}
                className={cn(
                  "px-2.5 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer",
                  "transition-colors duration-150 ease-out",
                  t.active
                    ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--edge)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Day sub-toggle: Kanban vs. List — only in Day mode. */}
          {view !== "overview" && (
            <div className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)]">
              {(["kanban", "list"] as const).map((v) => (
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
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
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
      ) : (
        <div className="flex flex-1 min-h-0 flex-row gap-4">
          {/* D-01: persistent first-class Inbox — always present across every
              view (kanban / list / overview) so dateless tasks stay visible
              regardless of the central day-scoped surface. */}
          {!inboxHidden && (
            <InboxColumn
              inboxTasks={inboxTasks}
              onTaskClick={setOpenTaskId}
              draggedTaskId={draggedTaskId}
              onDragStart={(id) => setDraggedTaskId(id)}
              onDragEnd={() => setDraggedTaskId(null)}
              onDrop={() => void handleInboxDrop()}
              selectedIds={selectedIds}
              onToggleSelected={(id) => toggleSelected(id)}
            />
          )}

          {/* Central area — the day-scoped surface. The DaySwitcher lives HERE
              (not page-wide) so it visually governs the central tasks and makes
              clear it does NOT scope the dateless Inbox. Overview is inherently
              multi-day, so it owns its own day toggles and hides the switcher. */}
          <div className="flex flex-1 min-h-0 flex-col">
            {view !== "overview" && (
              <DaySwitcher dateYmd={dateYmd} onDateChange={(ymd) => void setDateYmd(ymd)} />
            )}
            {view === "list" ? (
              <div
                onDragOver={(e) => {
                  if (!draggedTaskId) return;
                  e.preventDefault();
                  setListDragOver(true);
                }}
                onDragLeave={() => setListDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setListDragOver(false);
                  void handleDropOnDay(dateYmd);
                }}
                className={cn(
                  "flex-1 min-h-0 overflow-y-auto -mx-2 px-2 rounded-xl transition-shadow",
                  listDragOver &&
                    "ring-1 ring-[var(--hud-cyan)]/30 [--glass-glow-color:var(--hud-cyan)]"
                )}
              >
                <TaskList
                  tasks={dayFilteredTasks}
                  onTaskClick={setOpenTaskId}
                  addOptimistic={addOptimistic}
                />
              </div>
            ) : view === "overview" ? (
              <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
                <TaskOverviewView
                  tasks={filtered}
                  onTaskClick={setOpenTaskId}
                  onSelectDay={(ymd) => {
                    void setDateYmd(ymd);
                    void setView("kanban");
                  }}
                  draggingActive={!!draggedTaskId}
                  onDropDay={(ymd) => void handleDropOnDay(ymd)}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0">
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
          </div>
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
