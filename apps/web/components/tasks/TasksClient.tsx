"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { createTask } from "@/app/actions/tasks";
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
  initialTasks: TaskWithProjects[];
  projects: { id: string; name: string; isClass: boolean; courseCode: string | null }[];
  initialFilters: {
    priority: string[];
    status: string[];
    due: string[];
    project: string[];
  };
}

export function TasksClient({ initialTasks: tasks, projects, initialFilters }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // View toggle — URL ?view= + localStorage fallback (UI-SPEC D-05)
  const [view, setView] = useQueryState(
    "view",
    parseAsString.withDefault("kanban"),
  );

  // Detail panel — which task is open (URL ?task=<id>)
  const [openTaskId, setOpenTaskId] = useQueryState("task", parseAsString);

  // Read the SAME 4 filter dimensions TaskFilters writes — single source of truth via URL.
  // initialFilters (from server searchParams) hydrates SSR; nuqs on client keeps in sync.
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
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      // Priority filter (multi-select)
      if (
        filters.priority.length > 0 &&
        !filters.priority.includes(t.priority)
      )
        return false;

      // Status filter (multi-select)
      if (filters.status.length > 0 && !filters.status.includes(t.status))
        return false;

      // Project filter (multi-select; task matches if ANY of its projects is in filter)
      if (filters.project.length > 0) {
        const taskProjectIds = t.projects.map((p) => p.id);
        const hasMatch = taskProjectIds.some((pid) =>
          filters.project.includes(pid),
        );
        if (!hasMatch) return false;
      }

      // Due filter (multi-select; task matches if its due-state is in ANY selected window)
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
    tasks,
    filters.priority,
    filters.status,
    filters.due,
    filters.project,
  ]);

  async function handleCreateTask(input: {
    title: string;
    status: TaskStatus;
  }) {
    const r = await createTask({ ...input, projectIds: [] });
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Task added.");
    startTransition(() => {
      router.refresh();
    });
  }

  const openTask = openTaskId
    ? tasks.find((t) => t.id === openTaskId) ?? null
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
        // Empty state when filters are active but no results
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
              // useQueryStates is read-only here; TaskFilters handles clearing
              // navigate to clear filters via URL
              router.push("/tasks");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        // Empty state when no tasks exist at all
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <h2 className="font-serif text-[28px] font-semibold text-foreground">
            {"Nothing to do? Then you're free."}
          </h2>
          <p className="font-serif text-base text-muted-foreground mt-2">
            Add a task, or capture a thought and let Kiwi sort it later.
          </p>
        </div>
      ) : view === "list" ? (
        <TaskList tasks={filtered} onTaskClick={setOpenTaskId} />
      ) : (
        <KanbanBoard
          tasks={filtered}
          onTaskClick={setOpenTaskId}
          onCreateTask={handleCreateTask}
        />
      )}

      {/* Detail panel */}
      <TaskDetailPanel
        task={openTask}
        projects={projects}
        open={!!openTask}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
