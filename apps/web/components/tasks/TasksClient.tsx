"use client";

import {
  bulkDeleteTasks,
  bulkUpdateTaskDueDate,
  createTask,
  getTasksForCurrentUser,
  updateTask,
} from "@/app/actions/tasks";
import { deleteTask } from "@/app/actions/tasks";
import { createProject } from "@/app/actions/projects";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { useUndoToast } from "@/components/shared/use-undo-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { useOptimisticList, type OptimisticListAction } from "@/lib/realtime/useOptimisticList";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useTasksExpanded } from "@/lib/ui/useTasksExpanded";
import { fromYmd, toYmd } from "@/lib/tasks/date-shortcuts";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, endOfWeek, isAfter, isBefore, isSameDay, startOfDay } from "date-fns";
import { Check, ChevronDown, Maximize2, Minimize2, Plus, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { parseAsArrayOf, parseAsString, useQueryState, useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { GroupedBoard } from "./GroupedBoard";
import { InboxColumn } from "./InboxColumn";
import { KanbanBoard } from "./KanbanBoard";
import { type CardFields, DEFAULT_CARD_FIELDS } from "./TaskCard";
import { OverdueTasksPanel } from "./OverdueTasksPanel";
import { DaySwitcher } from "./DaySwitcher";
import { TaskOverviewView } from "./TaskOverviewView";
import { TaskFilters, type TaskFilterState } from "./TaskFilters";
import { TaskList } from "./TaskList";
import { TaskSelectionBar } from "./TaskSelectionBar";

// The detail panel carries the whole TipTap stack (6 @tiptap packages plus the
// mention/suggestion plumbing). Loading it on demand keeps all of that out of
// the initial /tasks bundle; combined with the conditional mount below, a cold
// load with no task open parses zero editor code and instantiates zero
// ProseMirror instances.
const TaskDetailPanel = dynamic(
  () => import("./TaskDetailPanel").then((m) => m.TaskDetailPanel),
  { ssr: false }
);

type TaskStatus = "not started" | "up next" | "in progress" | "almost done" | "lesno";

interface ProjectOption {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  courseCode: string | null;
  areaId: string | null;
  areaName: string | null;
  areaEmoji: string | null;
}

/** One segment of a grouped board or list (`?group=project|area`). */
export interface TaskGroup {
  key: string;
  label: string;
  tasks: TaskWithProjects[];
}

interface Props {
  userId: string;
  initialTasks: TaskWithProjects[];
  projects: ProjectOption[];
  areas: { id: string; name: string; emoji: string | null }[];
  initialFilters: {
    priority: string[];
    status: string[];
    due: string[];
    project: string[];
  };
  hashtags?: { id: string; name: string; displayName: string }[];
  people?: { id: string; name: string }[];
}

export type TasksOptimisticDispatch = (action: OptimisticListAction<TaskWithProjects>) => void;

const VIEW_SEGMENTS = [
  { value: "kanban", label: "Board" },
  { value: "list", label: "List" },
  { value: "overview", label: "Overview" },
] as const;

/**
 * /tasks orchestrator.
 *
 * Data pattern (unchanged):
 *   1. `useQuery({ queryKey: tableKey("tasks", userId), initialData })` —
 *      TanStack Query owns the canonical tasks cache, hydrated from SSR.
 *   2. `useTableSubscription("tasks")` + `("tasks_projects")` — Realtime echoes
 *      invalidate the cache → refetch via queryFn.
 *   3. `useOptimisticList` — a self-reconciling optimistic overlay that holds
 *      each patch until the canonical cache catches up.
 *
 * Refetch policy: optimistic mutations rely on the Realtime echo as the single
 * invalidation signal (one write → one refetch). The old belt-and-suspenders
 * explicit invalidate produced a guaranteed second full-table refetch per
 * mutation; the overlay already guarantees the local UI regardless of echo
 * timing, so the double fetch bought nothing. Deletes keep an awaited explicit
 * invalidate because the undo window must not un-hide a row before canonical
 * has caught up.
 *
 * Presentation: PageScaffold (SDC-1 §2.9) owns the header; one toolbar row
 * carries the view segments, the filter strip (single nuqs subscriber,
 * shallow — filtering is fully client-side, so filter changes make no server
 * request), and the display-options menu. The detail panel is one lazily
 * mounted SidePanel instance for both edit and create.
 */
export function TasksClient({
  userId,
  initialTasks,
  projects: initialProjects,
  areas,
  initialFilters,
  hashtags = [],
  people = [],
}: Props) {
  const queryClient = useQueryClient();
  const { show: showUndoToast } = useUndoToast();

  // Local projects list, seeded from SSR props. Inline project creation
  // (issue #34) appends new projects here so they're immediately selectable in
  // the detail panel's project picker without a full-page navigation. Re-sync
  // when the SSR prop changes (e.g. a project created elsewhere lands on nav).
  const [projects, setProjects] = useState<ProjectOption[]>(initialProjects);
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  // Create a project inline from the task project picker, then surface it
  // immediately so the caller can auto-select it. Returns the new id on
  // success, or null on failure (caller leaves selection untouched).
  const handleCreateProject = useCallback(
    async (input: { name: string; areaId: string }): Promise<string | null> => {
      const newId = crypto.randomUUID();
      const area = areas.find((a) => a.id === input.areaId) ?? null;
      const optimistic: ProjectOption = {
        id: newId,
        name: input.name,
        icon: null,
        isClass: false,
        courseCode: null,
        areaId: input.areaId,
        areaName: area?.name ?? null,
        areaEmoji: area?.emoji ?? null,
      };
      setProjects((prev) => [...prev, optimistic]);
      const r = await createProject({
        id: newId,
        areaId: input.areaId,
        name: input.name,
      });
      if (!r.success) {
        toast.error(r.error);
        setProjects((prev) => prev.filter((p) => p.id !== newId));
        return null;
      }
      await queryClient.invalidateQueries({
        queryKey: tableKey("projects", userId),
      });
      toast("Project created.");
      return newId;
    },
    [areas, queryClient, userId]
  );

  // ── Canonical cache ──────────────────────────────────────────────────────
  const { data: tasks = initialTasks } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    initialData: initialTasks,
  });

  // ── Realtime subscriptions ───────────────────────────────────────────────
  // tasks: primary table
  // tasks_projects: junction — flipping a task's project links from anywhere
  // also refreshes /tasks since project chips render in cards
  useTableSubscription("tasks", userId);
  useTableSubscription("tasks_projects", userId);

  // ── Optimistic overlay ───────────────────────────────────────────────────
  const [optimisticTasks, addOptimistic] = useOptimisticList<TaskWithProjects>(tasks);

  // Expand/fullscreen — localStorage-backed flag shared with the cockpit rail
  // (which hides itself). Ephemeral, never in the URL.
  const { expanded, toggle: toggleExpanded } = useTasksExpanded();

  // View — URL ?view= only. The old localStorage→URL sync effect could rewrite
  // the view after first paint (a visible flip on load); the URL is now the
  // single source of truth.
  const [view, setView] = useQueryState("view", parseAsString.withDefault("kanban"));

  // Day-aware kanban — URL ?date=YYYY-MM-DD, defaults to today.
  const [dateYmd, setDateYmd] = useQueryState("date", parseAsString.withDefault(toYmd(new Date())));

  // Segmentation — URL ?group=project|area. Applies to the board and the
  // list; the overview is inherently day-grouped and ignores it.
  const [groupParam, setGroupParam] = useQueryState("group", parseAsString);
  const grouping: "project" | "area" | null =
    groupParam === "project" || groupParam === "area" ? groupParam : null;
  const activeGrouping = view === "overview" ? null : grouping;

  // Selection state (kanban day view). Cleared on view/date change.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Long-lived optimistic-delete set. Held in plain useState (NOT useOptimistic)
  // so a deleted row stays hidden for the FULL 5s undo window regardless of
  // whether a transition is pending. commit fires the real delete + invalidate
  // THEN drops the id; addBack/error just drops the id with no server call.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const dropPending = useCallback((...ids: string[]) => {
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  // Reset selection when the active date or view changes; selections are
  // scoped to "what's visible on this surface now."
  useEffect(() => {
    setSelectedIds(new Set());
  }, [dateYmd, view]);

  // Cross-surface drag (Inbox tray → kanban columns + Not-Started tray
  // within KanbanBoard). Lifted to this component so the drag source
  // (Inbox cards rendered here, OUTSIDE KanbanBoard) and the drop target
  // (kanban columns INSIDE KanbanBoard) share state.
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  // List-view drop area affordance, written straight to the DOM (never React
  // state: dragover fires per frame and a state write there re-renders every
  // row it hovers past).
  const listDropRef = useRef<HTMLDivElement>(null);

  // Detail panel — which task is open (URL ?task=<id>, lib/entity-href.ts).
  const [openTaskId, setOpenTaskId] = useQueryState("task", parseAsString);
  // Draft status — set when the user starts a create (New task button or a
  // kanban column's add affordance). The one panel instance switches to create
  // mode with a synthetic task; Save calls createTask, close discards.
  const [draftStatus, setDraftStatus] = useState<TaskStatus | null>(null);

  // Deep-link create: `/tasks?create=now` (from the command palette or the
  // new-task shortcut) opens the draft panel in create mode, then strips the
  // param so a later refresh doesn't reopen it.
  const [createParam, setCreateParam] = useQueryState("create", parseAsString);
  useEffect(() => {
    if (createParam === "now") {
      setDraftStatus("not started");
      void setCreateParam(null);
    }
  }, [createParam, setCreateParam]);

  // Auto-hide completed "lesno" tasks by default. Persisted in localStorage so
  // the choice survives reloads. Lives in the display-options menu and only
  // applies to the overview (day surfaces keep the selected day's done work
  // visible by design).
  const [showLesno, setShowLesno] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowLesno(localStorage.getItem("tasks-show-lesno") === "true");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("tasks-show-lesno", String(showLesno));
  }, [showLesno]);

  // Which property pills show on task cards, from the display-options menu.
  // Persisted under the same key the board previously owned, so the
  // preference survives this lift unchanged.
  const [cardFields, setCardFields] = useState<CardFields>(DEFAULT_CARD_FIELDS);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("tasks-card-fields");
    if (stored) {
      try {
        setCardFields({ ...DEFAULT_CARD_FIELDS, ...JSON.parse(stored) });
      } catch {
        /* ignore malformed persisted value */
      }
    }
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("tasks-card-fields", JSON.stringify(cardFields));
  }, [cardFields]);

  // Hide/unhide the persistent Inbox column, from the display-options menu.
  const [inboxHidden, setInboxHidden] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setInboxHidden(localStorage.getItem("tasks-inbox-hidden") === "true");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("tasks-inbox-hidden", String(inboxHidden));
  }, [inboxHidden]);

  // The ONE nuqs subscriber for the 4 filter dimensions. TaskFilters is purely
  // presentational and receives this state + setter, so the two-hook first
  // paint disagreement is structurally impossible. `shallow` stays at its
  // default (true): filtering is 100% client-side, so a chip change must not
  // re-run the five server queries in tasks/page.tsx.
  const [filters, setFilters] = useQueryStates({
    priority: parseAsArrayOf(parseAsString).withDefault(initialFilters.priority),
    status: parseAsArrayOf(parseAsString).withDefault(initialFilters.status),
    due: parseAsArrayOf(parseAsString).withDefault(initialFilters.due),
    project: parseAsArrayOf(parseAsString).withDefault(initialFilters.project),
  });

  const handleFiltersChange = useCallback(
    (patch: Partial<TaskFilterState>) => {
      void setFilters(patch);
    },
    [setFilters]
  );

  // Concrete filter predicate. Filters the OPTIMISTIC tasks so local
  // optimistic inserts/updates flow through immediately.
  const filtered = useMemo(() => {
    return optimisticTasks.filter((t) => {
      // Optimistically-deleted rows vanish from every surface for the full
      // 5s undo window (survives regardless of transitions).
      if (pendingDeleteIds.has(t.id)) return false;
      // Auto-hide "lesno" (completed) unless the user explicitly opts in OR
      // they've requested lesno via an explicit status filter (that filter
      // takes precedence) OR the task is completed on the currently-selected
      // day: day-scoped views must keep that day's done work visible rather
      // than having it vanish on completion. The YMD string match keeps the
      // day-survival rule scoped; lesno tasks on OTHER days still obey the
      // global showLesno toggle. Undated lesno tasks never match dateYmd, so
      // the Inbox stays lesno-free regardless.
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
        // fromYmd, never `new Date(ymd)`: the bare Date constructor parses a
        // YMD as UTC midnight, which lands on yesterday in negative-UTC
        // timezones and makes today's tasks match "overdue".
        const due = t.dueDate ? fromYmd(t.dueDate) : null;
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
  }, [optimisticTasks, filters.priority, filters.status, filters.due, filters.project, showLesno, dateYmd, pendingDeleteIds]);

  // Day-scoped slice of `filtered` for the kanban (default view). Tasks
  // with a due date matching `dateYmd` show in the columns; undated tasks
  // accumulate in the Inbox tray and never appear in column bodies.
  // Compare YMD strings directly: t.dueDate from the DB is already a
  // YYYY-MM-DD string (drizzle `date` column), and dateYmd is the URL
  // YMD string. Round-tripping through Date introduces UTC-midnight
  // drift in negative-UTC timezones.
  const dayFilteredTasks = useMemo(
    () => filtered.filter((t) => t.dueDate === dateYmd),
    [filtered, dateYmd]
  );
  const inboxTasks = useMemo(
    () => filtered.filter((t) => !t.dueDate && t.status !== "lesno"),
    [filtered]
  );

  // Overdue tasks (issue #143): due date strictly before today's start, not
  // completed, and (by the dueDate guard) never undated. Computed from the
  // OPTIMISTIC `tasks` rather than the day-filtered slice so the panel spans
  // every overdue date regardless of which day the kanban is showing, and so
  // a reschedule optimistically removes the row the instant its dueDate moves
  // forward. Deliberately bypasses the `filtered`/`showLesno` plumbing: the
  // overdue set is its own concern, always lesno-free.
  const overdueTasks = useMemo(() => {
    const today = startOfDay(new Date());
    return optimisticTasks
      .filter((t) => {
        if (pendingDeleteIds.has(t.id)) return false;
        if (!t.dueDate) return false;
        if (t.status === "lesno") return false;
        return isBefore(fromYmd(t.dueDate), today);
      })
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }, [optimisticTasks, pendingDeleteIds]);

  // Groups derived from the full `filtered` list (not the day slice):
  // segmentation answers "what is on this project / in this area", which
  // spans days. The rule for the many-to-many edges: under group=project a
  // task appears once per project it belongs to, and zero-project tasks land
  // in an explicit "No project" group pinned last. group=area works the same
  // through each project's area; a task whose projects have no area (or which
  // has no project) lands in "No area", pinned last.
  const groups = useMemo<TaskGroup[] | null>(() => {
    if (!activeGrouping) return null;
    const map = new Map<string, TaskGroup>();
    const push = (key: string, label: string, task: TaskWithProjects) => {
      const existing = map.get(key);
      if (existing) existing.tasks.push(task);
      else map.set(key, { key, label, tasks: [task] });
    };
    if (activeGrouping === "project") {
      for (const t of filtered) {
        if (t.projects.length === 0) push("__none__", "No project", t);
        else for (const p of t.projects) push(p.id, p.name, t);
      }
    } else {
      const areaByProject = new Map(
        projects.map((p) => [
          p.id,
          p.areaId
            ? {
                id: p.areaId,
                label: `${p.areaEmoji ? `${p.areaEmoji} ` : ""}${p.areaName ?? "Area"}`,
              }
            : null,
        ])
      );
      for (const t of filtered) {
        const seen = new Set<string>();
        for (const p of t.projects) {
          const area = areaByProject.get(p.id);
          if (area && !seen.has(area.id)) {
            seen.add(area.id);
            push(area.id, area.label, t);
          }
        }
        if (seen.size === 0) push("__none__", "No area", t);
      }
    }
    const list = [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    const noneIndex = list.findIndex((g) => g.key === "__none__");
    if (noneIndex >= 0) list.push(...list.splice(noneIndex, 1));
    return list;
  }, [activeGrouping, filtered, projects]);

  // Reschedule a set of overdue tasks to a new day. REUSES the existing
  // bulkUpdateTaskDueDate server action (no new endpoint). Works for the
  // panel's mass action, the per-group quick action, and the drag-out path.
  const handleRescheduleOverdue = useCallback(
    async (ids: string[], dueYmd: string) => {
      if (ids.length === 0) return;
      for (const id of ids) {
        addOptimistic({ type: "update", id, patch: { dueDate: dueYmd } });
      }
      const r = await bulkUpdateTaskDueDate({ ids, dueDate: dueYmd });
      if (!r.success) {
        toast.error(r.error);
        for (const id of ids) addOptimistic({ type: "revert", id });
        return;
      }
      toast.success(
        `${ids.length} task${ids.length === 1 ? "" : "s"} rescheduled to ${dueYmd}`
      );
    },
    [addOptimistic]
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
      // Optimistic: update each row's dueDate immediately so the cards
      // disappear from the current day view (or land in Inbox if cleared).
      for (const id of ids) {
        addOptimistic({
          type: "update",
          id,
          patch: { dueDate: newDueDate },
        });
      }
      const r = await bulkUpdateTaskDueDate({ ids, dueDate: newDueDate });
      if (!r.success) {
        toast.error(r.error);
        for (const id of ids) addOptimistic({ type: "revert", id });
        return;
      }
      const tail = newDueDate === null ? "moved to Inbox" : `moved to ${newDueDate}`;
      toast.success(`${ids.length} task${ids.length === 1 ? "" : "s"} ${tail}`);
      clearSelection();
    },
    [selectedIds, addOptimistic, clearSelection]
  );

  /** Delete an explicit set of ids, undoable as one unit. The kanban
   *  selection bar and the overdue panel's own toolbar both route here, so
   *  "delete these" behaves identically wherever the selection was made. */
  const deleteTaskIds = useCallback(
    (ids: string[]) => {
    if (ids.length === 0) return;
    // Hide all selected rows via the SAME pendingDeleteIds set so the batch
    // is consistent and undoable as one unit.
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    clearSelection();
    showUndoToast({
      message: `${ids.length} task${ids.length === 1 ? "" : "s"} deleted`,
      optimisticRemove: () => {
        /* already done above via the set */
      },
      commit: async () => {
        const r = await bulkDeleteTasks({ ids });
        if (!r.success) {
          toast.error(r.error);
          dropPending(...ids);
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: tableKey("tasks", userId),
        });
        dropPending(...ids);
      },
      undo: () => {
        /* Server delete only fires on commit; nothing to roll back */
      },
      addBack: () => dropPending(...ids),
    });
    },
    [clearSelection, showUndoToast, queryClient, userId, dropPending]
  );

  const handleBulkDelete = useCallback(
    () => deleteTaskIds(Array.from(selectedIds)),
    [deleteTaskIds, selectedIds]
  );

  /**
   * The day the current selection sits on, for the "Move to" menu's Today
   * shortcut. Read off the selected tasks rather than the viewed date, because
   * a selection can span the day board AND the dateless Inbox: a mixed or
   * undated selection reports null, which is never today, so Today shows.
   */
  const selectionCurrentYmd = useMemo(() => {
    const selected = optimisticTasks.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return null;
    const first = selected[0]?.dueDate ?? null;
    return selected.every((t) => (t.dueDate ?? null) === first) ? first : null;
  }, [optimisticTasks, selectedIds]);

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
      addOptimistic({
        type: "update",
        id: t.id,
        patch: {
          ...(needsStatus ? { status: targetStatus } : {}),
          ...(needsDate ? { dueDate: dateYmd } : {}),
        },
      });
      const r = await updateTask({
        id: t.id,
        ...(needsStatus ? { status: targetStatus } : {}),
        ...(needsDate ? { dueDate: dateYmd } : {}),
      });
      if (!r.success) {
        toast.error(r.error);
        addOptimistic({ type: "revert", id: t.id });
      }
      // One drag = one write = one refetch, driven by the Realtime echo.
    },
    [draggedTask, dateYmd, addOptimistic]
  );

  // Drop a single card onto the Inbox column → null its due date. Mirrors
  // handleBulkMove's optimistic shape but for the lone dragged card, and
  // REUSES the existing bulkUpdateTaskDueDate server action. Silent optimistic
  // on the single-card path: success is its own feedback (card lands in the
  // Inbox); only a failure surfaces a toast.
  const handleInboxDrop = useCallback(async () => {
    const id = draggedTaskId;
    setDraggedTaskId(null);
    if (!id) return;
    const t = optimisticTasks.find((task) => task.id === id);
    // Already undated → nothing to do (dragging an Inbox card back onto itself).
    if (t && !t.dueDate) return;
    addOptimistic({ type: "update", id, patch: { dueDate: null } });
    const r = await bulkUpdateTaskDueDate({ ids: [id], dueDate: null });
    if (!r.success) {
      toast.error("Couldn't move to Inbox. Try again.");
      addOptimistic({ type: "revert", id });
    }
  }, [draggedTaskId, optimisticTasks, addOptimistic]);

  // Drop a dragged card onto a specific day (List view drop area → the active
  // day; Overview → the row's day). Forces status to "not started" and sets
  // the due date to the target day, mirroring handleKanbanDrop.
  const handleDropOnDay = useCallback(
    async (ymd: string) => {
      const t = draggedTask;
      setDraggedTaskId(null);
      if (!t) return;
      const needsStatus = t.status !== "not started";
      const needsDate = t.dueDate !== ymd;
      if (!needsStatus && !needsDate) return;
      addOptimistic({
        type: "update",
        id: t.id,
        patch: {
          ...(needsStatus ? { status: "not started" } : {}),
          ...(needsDate ? { dueDate: ymd } : {}),
        },
      });
      const r = await updateTask({
        id: t.id,
        ...(needsStatus ? { status: "not started" } : {}),
        ...(needsDate ? { dueDate: ymd } : {}),
      });
      if (!r.success) {
        toast.error(r.error);
        addOptimistic({ type: "revert", id: t.id });
      }
    },
    [draggedTask, addOptimistic]
  );

  async function handleCreateTask(input: {
    title: string;
    status: TaskStatus;
  }) {
    // Client-generated UUID flows through to the server so the Realtime echo
    // arrives with the same id (no-op in the reducer).
    const newId = crypto.randomUUID();
    // Default the new task's due date to the day shown in the kanban header
    // AND the status to whichever column the inline composer was in.
    const defaultedDueDate = dateYmd;
    // Optimistic insert FIRST, and OUTSIDE any transition: the overlay is
    // plain state that holds until canonical catches up, so wrapping it in a
    // transition only tells React the card may appear late. It did.
    addOptimistic({
      type: "insert",
      row: {
          id: newId,
          title: input.title,
          notes: null,
          priority: "P3",
          status: input.status,
          dueDate: defaultedDueDate,
          dueTime: null,
          url: null,
          kanbanPosition: 0,
          completedAt: null,
          createdAt: new Date(),
          recurrence: null,
          projects: [],
          hashtags: [],
          people: [],
          reminderOffsetsMin: [],
          peopleDerivedAt: null,
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
      toast.error(r.error);
      addOptimistic({ type: "revert", id: newId });
      return;
    }
    toast("Task added.");
  }

  const openTask = openTaskId ? (optimisticTasks.find((t) => t.id === openTaskId) ?? null) : null;

  // Synthetic draft for create mode. id stays constant so React doesn't
  // re-init the form between toggles.
  const draftTask: TaskWithProjects | null = draftStatus
    ? {
        id: "__draft__",
        title: "",
        notes: null,
        priority: "P3",
        status: draftStatus,
        dueDate: dateYmd,
        dueTime: null,
        url: null,
        kanbanPosition: 0,
        completedAt: null,
        createdAt: new Date(),
        recurrence: null,
        projects: [],
        hashtags: [],
        people: [],
        reminderOffsetsMin: [],
        peopleDerivedAt: null,
      }
    : null;

  // One panel, two modes. A just-started draft takes the slot even if a task
  // is open behind it; closing the draft returns to that task.
  const panelTask = draftTask ?? openTask;
  const panelMode: "edit" | "create" = draftTask ? "create" : "edit";
  const closePanel = useCallback(() => {
    setDraftStatus(null);
    if (openTaskId) void setOpenTaskId(null);
  }, [openTaskId, setOpenTaskId]);

  const hasActiveFilters =
    filters.priority.length > 0 ||
    filters.status.length > 0 ||
    filters.due.length > 0 ||
    filters.project.length > 0;

  // Glance stats for the scaffold meta row, computed locally from the same
  // `tasks` list the body renders.
  const headerStats = useMemo(() => {
    const today = startOfDay(new Date());
    const open = tasks.filter((t) => t.status !== "lesno");
    // fromYmd, not `new Date(ymd)` (UTC-midnight drift; see the due filter).
    const overdue = open.filter((t) => t.dueDate && isBefore(fromYmd(t.dueDate), today)).length;
    return {
      open: open.length,
      overdue,
      done: tasks.length - open.length,
    };
  }, [tasks]);

  // Grouped views are a cross-day register; the day-scoped triage rail and
  // day switcher step aside while one is active.
  const showTriageRail =
    view !== "overview" &&
    !activeGrouping &&
    (overdueTasks.length > 0 || (!inboxHidden && inboxTasks.length > 0));

  return (
    <>
      <PageScaffold
        title="Tasks"
        meta={
          <PageScaffold.MetaRow>
            {[
              <span key="open" className="tabular-nums">
                {headerStats.open} open
              </span>,
              headerStats.overdue > 0 ? (
                <span key="overdue" className="tabular-nums">
                  {headerStats.overdue} overdue
                </span>
              ) : null,
              headerStats.done > 0 ? (
                <span key="done" className="tabular-nums">
                  {headerStats.done} done
                </span>
              ) : null,
            ]}
          </PageScaffold.MetaRow>
        }
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-lg"
              onClick={toggleExpanded}
              aria-label={expanded ? "Exit fullscreen" : "Expand tasks to fullscreen"}
            >
              {expanded ? (
                <Minimize2 size={15} strokeWidth={1.5} />
              ) : (
                <Maximize2 size={15} strokeWidth={1.5} />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-lg"
              onClick={() => setDraftStatus("not started")}
            >
              <Plus size={14} strokeWidth={2} />
              New task
            </Button>
          </>
        }
      >
        {/* Toolbar: views left, filters centre, display options right. One row,
            fixed height; the chip strip scrolls sideways rather than wrapping,
            so adding a filter never shifts the layout below. */}
        <div className="mt-8 flex h-9 items-center gap-3">
          <SegmentedControl
            value={view}
            options={VIEW_SEGMENTS}
            onChange={(v) => void setView(v)}
            ariaLabel="Tasks view"
          />
          {view !== "overview" && (
            <GroupMenu grouping={grouping} onChange={(g) => void setGroupParam(g)} />
          )}
          <div className="min-w-0 flex-1">
            <TaskFilters projects={projects} filters={filters} onChange={handleFiltersChange} />
          </div>
          <DisplayMenu
            view={view}
            showLesno={showLesno}
            onShowLesnoChange={setShowLesno}
            inboxHidden={inboxHidden}
            onInboxHiddenChange={setInboxHidden}
            cardFields={cardFields}
            onCardFieldsChange={setCardFields}
          />
        </div>

        {/* Content */}
        {filtered.length === 0 && hasActiveFilters ? (
          <EmptyState
            size="page"
            title="Nothing matches"
            description="Adjust the filters, or clear them all."
            action={{
              label: "Clear filters",
              onClick: () =>
                void setFilters({ priority: [], status: [], due: [], project: [] }),
            }}
          />
        ) : tasks.length === 0 && !hasActiveFilters ? (
          <EmptyState
            size="page"
            title="Nothing needs doing"
            description="Which probably means you've handled everything. Add a task when that changes."
            action={{ label: "New task", onClick: () => setDraftStatus("not started") }}
          />
        ) : (
          <div className="mt-6 flex flex-col">
            {/* Triage rail: Overdue and the undated Inbox side by side on wide
                stages, stacked otherwise. Cards stay draggable: dropping an
                overdue card on a day target reschedules it; dropping any card
                on the Inbox nulls its due date. */}
            {showTriageRail && (
              <div className="mb-6 grid items-start gap-4 @3xl/main:grid-cols-2">
                {overdueTasks.length > 0 ? (
                  <OverdueTasksPanel
                    overdueTasks={overdueTasks}
                    onTaskClick={setOpenTaskId}
                    onReschedule={(ids, dueYmd) => void handleRescheduleOverdue(ids, dueYmd)}
                    onDeleteIds={deleteTaskIds}
                    draggedTaskId={draggedTaskId}
                    onDragStart={(id) => setDraggedTaskId(id)}
                    onDragEnd={() => setDraggedTaskId(null)}
                  />
                ) : null}
                {!inboxHidden && inboxTasks.length > 0 && (
                  <InboxColumn
                    inboxTasks={inboxTasks}
                    onTaskClick={setOpenTaskId}
                    draggedTaskId={draggedTaskId}
                    onDragStart={(id) => setDraggedTaskId(id)}
                    onDragEnd={() => setDraggedTaskId(null)}
                    onDrop={() => void handleInboxDrop()}
                    selectedIds={selectedIds}
                    onToggleSelected={(id) => toggleSelected(id)}
                    onToggleSelectAll={(ids) => toggleColumnSelection("not started", ids)}
                  />
                )}
              </div>
            )}

            {/* The day-scoped surface. The DaySwitcher lives here (not
                page-wide) so it visually governs the central tasks and makes
                clear it does NOT scope the dateless Inbox. Overview is
                inherently multi-day and hides it. */}
            {view !== "overview" && !activeGrouping && (
              <DaySwitcher dateYmd={dateYmd} onDateChange={(ymd) => void setDateYmd(ymd)} />
            )}
            {groups && view === "list" ? (
              <div className="flex flex-col gap-8">
                {groups.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    {/* Craft-style disclosure label: small gray text-micro,
                        never a heading-weight title (craft-ui-v2). */}
                    <div className="mb-2 flex items-baseline gap-2 px-2">
                      <h2 className="min-w-0 truncate text-micro font-medium text-[var(--ink-muted)]">
                        {group.label}
                      </h2>
                      <span className="text-micro tabular-nums text-[var(--ink-faint)]">
                        {group.tasks.length}
                      </span>
                    </div>
                    <TaskList
                      id={`tasks-list-${group.key}`}
                      tasks={group.tasks}
                      onTaskClick={setOpenTaskId}
                      addOptimistic={addOptimistic}
                      showHeader={false}
                    />
                  </section>
                ))}
              </div>
            ) : groups ? (
              <GroupedBoard groups={groups} onTaskClick={setOpenTaskId} />
            ) : view === "list" ? (
              <div
                ref={listDropRef}
                onDragOver={(e) => {
                  if (!draggedTaskId) return;
                  e.preventDefault();
                  if (listDropRef.current)
                    listDropRef.current.style.boxShadow = "inset 0 0 0 1px var(--accent)";
                }}
                onDragLeave={() => {
                  if (listDropRef.current) listDropRef.current.style.boxShadow = "none";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (listDropRef.current) listDropRef.current.style.boxShadow = "none";
                  void handleDropOnDay(dateYmd);
                }}
                className="-mx-2 rounded-lg px-2"
              >
                <TaskList
                  tasks={dayFilteredTasks}
                  onTaskClick={setOpenTaskId}
                  addOptimistic={addOptimistic}
                />
              </div>
            ) : view === "overview" ? (
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
            ) : (
              <KanbanBoard
                tasks={dayFilteredTasks}
                userId={userId}
                cardFields={cardFields}
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
            )}
          </div>
        )}
      </PageScaffold>

      <TaskSelectionBar
        count={selectedIds.size}
        onMoveTo={(d) => void handleBulkMove(d)}
        currentYmd={selectionCurrentYmd}
        onDeleteSelected={handleBulkDelete}
        onClear={clearSelection}
        pending={false}
      />

      {/* Detail panel: ONE lazily mounted instance for edit and create. On a
          cold load with no ?task= param nothing here mounts, so the TipTap
          stack stays out of the page entirely. */}
      {panelTask ? (
        <TaskDetailPanel
          key={panelMode === "create" ? "__draft__" : panelTask.id}
          task={panelTask}
          projects={projects}
          hashtags={hashtags}
          people={people}
          areas={areas}
          onCreateProject={handleCreateProject}
          open
          onClose={closePanel}
          addOptimistic={addOptimistic}
          mode={panelMode}
          onDeleteTask={(task) => {
            // 1. Optimistic remove via the long-lived pendingDeleteIds set;
            //    the card stays hidden for the full 5s window.
            setPendingDeleteIds((prev) => new Set(prev).add(task.id));
            // 2. Toast with 5s Undo
            showUndoToast({
              message: `"${task.title}" deleted`,
              optimisticRemove: () => {
                /* already done above via the set */
              },
              commit: async () => {
                const r = await deleteTask(task.id);
                if (!r.success) {
                  toast.error(r.error);
                  // Server rejected the delete: restore the row.
                  dropPending(task.id);
                  return;
                }
                // Refetch THEN drop the id so the refetched canonical data is
                // the single source of truth (the row must not flash back).
                await queryClient.invalidateQueries({
                  queryKey: tableKey("tasks", userId),
                });
                dropPending(task.id);
              },
              undo: () => {
                /* Server delete only fires on commit; nothing to roll back */
              },
              addBack: () => dropPending(task.id),
            });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Craft segmented chip row (craft-ui-v2): the view switcher is a row of
 * `.craft-chip` pills, the active one filled with the neutral `--selected`
 * fallback (views carry no semantic tint — color is data, not decoration).
 * `data-active` is set only while active, never a stringified false.
 */
function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex shrink-0 items-center gap-1.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active ? "true" : undefined}
            onClick={() => onChange(opt.value)}
            className="craft-chip cursor-pointer-always"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const GROUP_OPTIONS: { value: "project" | "area" | null; label: string }[] = [
  { value: null, label: "No grouping" },
  { value: "project", label: "Project" },
  { value: "area", label: "Area" },
];

/** Segment the board or list by project or area (`?group=`). */
function GroupMenu({
  grouping,
  onChange,
}: {
  grouping: "project" | "area" | null;
  onChange: (next: "project" | "area" | null) => void;
}) {
  const activeLabel = grouping === "project" ? "Project" : grouping === "area" ? "Area" : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Chip grammar matches the view segments: rest chip when no grouping,
            neutral --selected fill (via data-active) while one is applied. */}
        <button
          type="button"
          data-active={activeLabel ? "true" : undefined}
          className="craft-chip shrink-0 cursor-pointer-always"
        >
          {activeLabel ? `Group: ${activeLabel}` : "Group"}
          <ChevronDown size={13} strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {GROUP_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.label}
            onClick={() => onChange(opt.value)}
            className="text-meta"
          >
            <span className="flex-1">{opt.label}</span>
            {grouping === opt.value ? <Check size={13} strokeWidth={2} /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Display options: view preferences demoted OUT of the filter row into one
 * quiet menu. Nothing in here ever renders disabled; options that do not
 * apply to the current view are simply absent.
 */
const CARD_FIELD_ROWS: { key: keyof CardFields; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "dueDate", label: "Due date" },
  { key: "project", label: "Project" },
];

function DisplayMenu({
  view,
  showLesno,
  onShowLesnoChange,
  inboxHidden,
  onInboxHiddenChange,
  cardFields,
  onCardFieldsChange,
}: {
  view: string;
  showLesno: boolean;
  onShowLesnoChange: (next: boolean) => void;
  inboxHidden: boolean;
  onInboxHiddenChange: (next: boolean) => void;
  cardFields: CardFields;
  onCardFieldsChange: (next: CardFields) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Display options"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg cursor-pointer-always",
            "text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out",
            "hover:bg-[var(--hover)] hover:text-[var(--ink)]",
            "data-[state=open]:bg-[var(--selected)] data-[state=open]:text-[var(--ink)]"
          )}
        >
          <SlidersHorizontal size={15} strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 rounded-xl border-[var(--edge)] p-2">
        <p className="px-2 pb-1.5 text-micro font-medium text-[var(--ink-faint)]">Display</p>
        <div className="flex flex-col">
          {view !== "overview" ? (
            <DisplayToggleRow
              label="Show inbox"
              checked={!inboxHidden}
              onToggle={() => onInboxHiddenChange(!inboxHidden)}
            />
          ) : (
            <DisplayToggleRow
              label="Show completed"
              checked={showLesno}
              onToggle={() => onShowLesnoChange(!showLesno)}
            />
          )}
        </div>
        <p className="px-2 pb-1.5 pt-3 text-micro font-medium text-[var(--ink-faint)]">
          Show on cards
        </p>
        <div className="flex flex-col">
          {CARD_FIELD_ROWS.map(({ key, label }) => (
            <DisplayToggleRow
              key={key}
              label={label}
              checked={cardFields[key]}
              onToggle={() => onCardFieldsChange({ ...cardFields, [key]: !cardFields[key] })}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DisplayToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
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
          checked
            ? "border-[var(--edge-strong)] bg-[var(--selected)] text-[var(--ink)]"
            : "border-[var(--edge)] text-transparent"
        )}
      >
        <Check size={11} strokeWidth={2.5} />
      </span>
    </button>
  );
}
