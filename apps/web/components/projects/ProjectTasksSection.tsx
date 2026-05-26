"use client";

import { useEffect, useMemo, useState, useOptimistic, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Kanban as KanbanIcon,
  List as ListIcon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { createTask, getTasksForCurrentUser } from "@/app/actions/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { cn } from "@/lib/utils";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

type TaskStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

interface Props {
  userId: string;
  projectId: string;
  /** Project list for TaskDetailPanel's project multi-select. */
  projects: ReadonlyArray<{
    id: string;
    name: string;
    isClass: boolean;
    courseCode: string | null;
  }>;
  /** SSR-hydrated tasks for THIS project. Filters the global cache below. */
  initialTasks: TaskWithProjects[];
}

type View = "kanban" | "list";

const VIEW_KEY = "project-tasks-view";
const COLLAPSED_KEY = "project-tasks-collapsed";
const SHOW_LESNO_KEY = "project-tasks-show-lesno";

/**
 * Project-scoped task surface. Reuses the canonical KanbanBoard / TaskList /
 * TaskDetailPanel components from /tasks so behavior (DnD, optimistic, undo,
 * realtime invalidate, animations) is identical — only the input set is
 * filtered to tasks linked to THIS project, and create defaults to linking
 * the new task back to this project.
 *
 * Cache strategy: we read from the SAME canonical `["tasks", userId]` query
 * key that /tasks uses, then derive the project's slice locally. This means
 * a realtime update from any surface lands here for free, and we never
 * thrash a per-project key that would never be invalidated by the realtime
 * channel.
 */
export function ProjectTasksSection({
  userId,
  projectId,
  projects,
  initialTasks,
}: Props) {
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<View>("kanban");
  const [collapsed, setCollapsed] = useState(false);
  const [showLesno, setShowLesno] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Persist view + collapse + lesno-visibility scoped to project pages.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "list" || v === "kanban") setView(v);
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "true");
    setShowLesno(localStorage.getItem(SHOW_LESNO_KEY) === "true");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, view);
  }, [view]);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(SHOW_LESNO_KEY, String(showLesno));
  }, [showLesno]);

  // Canonical realtime subscription — shared with /tasks.
  useTableSubscription("tasks", userId);
  useTableSubscription("tasks_projects", userId);

  // Pull from the canonical cache; SSR seeds via getTasksForCurrentUser. The
  // server already hydrated this query elsewhere (e.g. /tasks), and the
  // project-scoped SSR fetch we did in page.tsx primes the slice — but the
  // queryFn is the authoritative refetch path.
  const { data: allTasks = [] } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    // Seed the GLOBAL key with whatever SSR delivered for THIS project so the
    // initial paint matches the URL. The first realtime echo / refetch fills
    // in the rest of the user's tasks. (Mild over-fetch is OK; under-fetch
    // would mean empty UI on first paint.)
    initialData: initialTasks,
  });

  // Optimistic overlay — same shape as TasksClient.
  const [optimisticTasks, addOptimistic] = useOptimistic(
    allTasks,
    optimisticReducer<TaskWithProjects>,
  );

  // Derive THIS project's tasks — single source of truth for both views.
  // Auto-hide completed "lesno" tasks by default per user spec; toggle in
  // the header brings them back without losing the rest of the view state.
  const projectTasks = useMemo(() => {
    const linked = optimisticTasks.filter((t) =>
      t.projects.some((p) => p.id === projectId),
    );
    return showLesno ? linked : linked.filter((t) => t.status !== "lesno");
  }, [optimisticTasks, projectId, showLesno]);

  const lesnoCount = useMemo(
    () =>
      optimisticTasks.filter(
        (t) =>
          t.status === "lesno" && t.projects.some((p) => p.id === projectId),
      ).length,
    [optimisticTasks, projectId],
  );

  async function handleCreateTask(input: { title: string; status: TaskStatus }) {
    const newId = crypto.randomUUID();
    startTransition(async () => {
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
          // Pre-link to this project so the optimistic row passes the
          // projectTasks filter and appears instantly.
          projects: [{ id: projectId, name: "" }],
        },
      });
      const r = await createTask({
        id: newId,
        title: input.title,
        status: input.status,
        projectIds: [projectId],
      });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      // Same belt-and-suspenders refetch as TasksClient — guarantees the
      // optimistic-revert lands on fresh canonical data (Realtime is a
      // cross-device sync path, not the local guarantee).
      await queryClient.invalidateQueries({
        queryKey: tableKey("tasks", userId),
      });
      toast("Task added.");
    });
  }

  const openTask = openTaskId
    ? projectTasks.find((t) => t.id === openTaskId) ?? null
    : null;

  return (
    <section className="flex flex-col gap-4">
      {/* Section header — eyebrow + count + collapse on the left; lesno
          toggle + view toggle on the right. Hidden body still shows the
          row so the user can flip the section back on. */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="project-tasks-body"
          className="group flex items-center gap-2 -ml-1 px-1 py-1 rounded-sm hover:bg-[var(--surface)] transition-colors cursor-pointer"
        >
          <span className="text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition-colors">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition-colors">
            Tasks
          </h2>
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
            ({projectTasks.length}
            {!showLesno && lesnoCount > 0 ? (
              <span className="text-[var(--ink-muted)]/70">
                {" "}
                · {lesnoCount} lesno hidden
              </span>
            ) : null}
            )
          </span>
        </button>

        {!collapsed && (
          <div className="flex items-center gap-2">
            {/* Lesno visibility toggle — small inline pill. */}
            <button
              type="button"
              onClick={() => setShowLesno((v) => !v)}
              aria-pressed={showLesno}
              className={cn(
                "px-2 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer transition-colors duration-150 ease-out border",
                showLesno
                  ? "border-[var(--edge)] bg-[var(--surface-raised)] text-[var(--ink)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge)]",
              )}
              title={showLesno ? "Hide completed (lesno) tasks" : "Show completed (lesno) tasks"}
            >
              {showLesno ? "Hide lesno" : "Show lesno"}
            </button>

            <div className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)]">
              <ViewToggle
                active={view === "kanban"}
                onClick={() => setView("kanban")}
                label="Kanban"
                icon={<KanbanIcon size={11} />}
              />
              <ViewToggle
                active={view === "list"}
                onClick={() => setView("list")}
                label="List"
                icon={<ListIcon size={11} />}
              />
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div
          id="project-tasks-body"
          className={cn(
            view === "kanban" ? "h-[560px] min-h-0 flex" : "",
            "rounded-lg",
          )}
        >
          {view === "kanban" ? (
            <KanbanBoard
              tasks={projectTasks}
              userId={userId}
              onTaskClick={setOpenTaskId}
              onCreateTask={handleCreateTask}
              addOptimistic={addOptimistic}
            />
          ) : (
            <TaskList
              tasks={projectTasks}
              onTaskClick={setOpenTaskId}
              addOptimistic={addOptimistic}
            />
          )}
        </div>
      )}

      <TaskDetailPanel
        task={openTask}
        projects={projects.map((p) => ({ ...p }))}
        open={!!openTask}
        onClose={() => setOpenTaskId(null)}
        addOptimistic={addOptimistic}
        onDeleteTask={(task) => {
          // React 19 — useOptimistic dispatches must live inside a transition.
          startTransition(() => {
            addOptimistic({ type: "delete", id: task.id });
          });
        }}
      />
    </section>
  );
}

function ViewToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-2 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer transition-colors duration-150 ease-out inline-flex items-center gap-1.5",
        active
          ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--edge)]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
