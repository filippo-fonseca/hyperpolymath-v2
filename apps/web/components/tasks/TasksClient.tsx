"use client";

import { useEffect, useMemo, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
} from "@/app/actions/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";
import { KanbanBoard } from "./KanbanBoard";
import { TaskList } from "./TaskList";
import { TaskFilters } from "./TaskFilters";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { Button } from "@/components/ui/button";
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
 *      the reducer's "insert" no-ops on echo (RT-05 dedupe).
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
  const [, startTransition] = useTransition();

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

  // Detail panel — which task is open (URL ?task=<id>)
  const [openTaskId, setOpenTaskId] = useQueryState("task", parseAsString);

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
    if (stored === "list" && (!view || view === "kanban")) {
      setView("list");
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
  ]);

  async function handleCreateTask(input: {
    title: string;
    status: TaskStatus;
  }) {
    // RT-05: client-generated UUID flows through to the server so the
    // Realtime echo arrives with the same id (no-op in the reducer).
    const newId = crypto.randomUUID();
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
          dueDate: null,
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
        projectIds: [],
      });
      if (!r.success) {
        // D-03: silent revert + toast.error
        toast.error(r.error);
        return;
      }
      toast("Task added.");
      // Realtime echo will arrive with the same id → invalidate → refetch.
      // useOptimistic state syncs back to the canonical refetched row.
    });
  }

  const openTask = openTaskId
    ? optimisticTasks.find((t) => t.id === openTaskId) ?? null
    : null;

  const hasActiveFilters =
    filters.priority.length > 0 ||
    filters.status.length > 0 ||
    filters.due.length > 0 ||
    filters.project.length > 0;

  return (
    <div className="flex flex-col gap-4 p-6 min-h-0">
      {/* Toolbar: filters + view toggle */}
      <div className="flex items-center justify-between gap-4">
        <TaskFilters projects={projects} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView(view === "kanban" ? "list" : "kanban")}
          className="font-sans text-[13px] flex-shrink-0"
        >
          {view === "kanban" ? "List" : "Kanban"}
        </Button>
      </div>

      {/* Content area */}
      {filtered.length === 0 && hasActiveFilters ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <h2 className="font-serif text-[28px] font-semibold text-foreground">
            Nothing matches.
          </h2>
          <p className="font-serif text-base text-muted-foreground mt-2">
            Adjust your filters, or clear them to see everything.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="font-sans text-[13px] mt-4"
            onClick={() => {
              router.push("/tasks");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : view === "list" ? (
        <TaskList
          tasks={filtered}
          onTaskClick={setOpenTaskId}
          addOptimistic={addOptimistic}
        />
      ) : (
        <KanbanBoard
          tasks={filtered}
          onTaskClick={setOpenTaskId}
          onCreateTask={handleCreateTask}
          addOptimistic={addOptimistic}
        />
      )}

      {/* Detail panel */}
      <TaskDetailPanel
        task={openTask}
        projects={projects}
        open={!!openTask}
        onClose={() => setOpenTaskId(null)}
        addOptimistic={addOptimistic}
      />
    </div>
  );
}
