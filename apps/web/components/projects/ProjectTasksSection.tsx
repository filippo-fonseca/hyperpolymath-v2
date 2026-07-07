"use client";

import { createTask, deleteTask, getTasksForCurrentUser } from "@/app/actions/tasks";
import { createProject } from "@/app/actions/projects";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { TaskList } from "@/components/tasks/TaskList";
import { useUndoToast } from "@/components/shared/use-undo-toast";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Kanban as KanbanIcon, List as ListIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

type TaskStatus = "not started" | "up next" | "in progress" | "almost done" | "lesno";

interface Props {
  userId: string;
  projectId: string;
  /** Project list for TaskDetailPanel's project multi-select. */
  projects: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    isClass: boolean;
    courseCode: string | null;
    areaName: string | null;
    areaEmoji: string | null;
  }>;
  /** Areas available for inline project creation (issue #34). */
  areas: { id: string; name: string; emoji: string | null }[];
  /** SSR-hydrated tasks for THIS project. Filters the global cache below. */
  initialTasks: TaskWithProjects[];
}

type ProjectOption = {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  courseCode: string | null;
  areaName: string | null;
  areaEmoji: string | null;
};

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
  projects: initialProjectOptions,
  areas,
  initialTasks,
}: Props) {
  const queryClient = useQueryClient();
  // Local project list so an inline-created project (issue #34) is immediately
  // selectable in the detail panel without a navigation. Seeded from props and
  // re-synced when the SSR prop changes.
  const [projects, setProjects] = useState<ProjectOption[]>(() =>
    initialProjectOptions.map((p) => ({ ...p })),
  );
  useEffect(() => {
    setProjects(initialProjectOptions.map((p) => ({ ...p })));
  }, [initialProjectOptions]);

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
    [areas, queryClient, userId],
  );
  const [, startTransition] = useTransition();
  const [view, setView] = useState<View>("kanban");
  const [collapsed, setCollapsed] = useState(false);
  const [showLesno, setShowLesno] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Draft create — clicking "Add task" in a column opens the full detail
  // panel as a draft (mirrors /tasks) instead of the inline composer.
  const [draftStatus, setDraftStatus] = useState<TaskStatus | null>(null);

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
    if (typeof window !== "undefined") localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(SHOW_LESNO_KEY, String(showLesno));
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

  // Optimistic overlay — same RT-06 self-reconciling hook as TasksClient.
  const [optimisticTasks, addOptimistic] = useOptimisticList<TaskWithProjects>(allTasks);

  // Long-lived optimistic-delete set (mirrors TasksClient) — held in plain
  // state so a deleted row stays hidden for the full 5s undo window.
  const { show: showUndoToast } = useUndoToast();
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const dropPending = useCallback((...ids: string[]) => {
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  // Derive THIS project's tasks — single source of truth for both views.
  // Auto-hide completed "lesno" tasks by default per user spec; toggle in
  // the header brings them back without losing the rest of the view state.
  const projectTasks = useMemo(() => {
    const linked = optimisticTasks.filter(
      (t) => !pendingDeleteIds.has(t.id) && t.projects.some((p) => p.id === projectId),
    );
    return showLesno ? linked : linked.filter((t) => t.status !== "lesno");
  }, [optimisticTasks, projectId, showLesno, pendingDeleteIds]);

  const lesnoCount = useMemo(
    () =>
      optimisticTasks.filter(
        (t) => t.status === "lesno" && t.projects.some((p) => p.id === projectId)
      ).length,
    [optimisticTasks, projectId]
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
          url: null,
          kanbanPosition: 0,
          completedAt: null,
          createdAt: new Date(),
          recurrence: null,
          // Pre-link to this project so the optimistic row passes the
          // projectTasks filter and appears instantly.
          projects: [{ id: projectId, name: "" }],
          hashtags: [],
          people: [],
          peopleDerivedAt: null,
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
        addOptimistic({ type: "revert", id: newId });
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

  const openTask = openTaskId ? (projectTasks.find((t) => t.id === openTaskId) ?? null) : null;

  // Synthetic draft for create mode — pre-linked to THIS project so the new
  // task lands here. id stays constant so the panel doesn't re-init between
  // toggles. Mirrors TasksClient's draftTask.
  const currentProject = projects.find((p) => p.id === projectId);
  const draftTask: TaskWithProjects | null = draftStatus
    ? {
        id: "__draft__",
        title: "",
        notes: null,
        priority: "P3",
        status: draftStatus,
        dueDate: null,
        url: null,
        kanbanPosition: 0,
        completedAt: null,
        createdAt: new Date(),
        recurrence: null,
        projects: [{ id: projectId, name: currentProject?.name ?? "" }],
        hashtags: [],
        people: [],
        peopleDerivedAt: null,
      }
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
              <span className="text-[var(--ink-muted)]/70"> · {lesnoCount} lesno hidden</span>
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
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge)]"
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
          className={cn(view === "kanban" ? "h-[560px] min-h-0 flex" : "", "rounded-lg")}
        >
          {view === "kanban" ? (
            <KanbanBoard
              tasks={projectTasks}
              userId={userId}
              onTaskClick={setOpenTaskId}
              onCreateTask={handleCreateTask}
              onStartCreate={(s) => setDraftStatus(s)}
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
        projects={projects}
        areas={areas}
        onCreateProject={handleCreateProject}
        open={!!openTask}
        onClose={() => setOpenTaskId(null)}
        addOptimistic={addOptimistic}
        onDeleteTask={(task) => {
          // Hide the row for the 5s undo window via the persistent set, then
          // commit the real server delete (mirrors TasksClient's flow).
          setPendingDeleteIds((prev) => new Set(prev).add(task.id));
          const preview = task.title.slice(0, 40);
          const ellipsis = task.title.length > 40 ? "…" : "";
          showUndoToast({
            message: `"${preview}${ellipsis}" deleted`,
            optimisticRemove: () => {
              /* already hidden above via the set */
            },
            commit: async () => {
              const r = await deleteTask(task.id);
              if (!r.success) {
                toast.error(r.error);
                dropPending(task.id);
                return;
              }
              await queryClient.invalidateQueries({
                queryKey: tableKey("tasks", userId),
              });
              dropPending(task.id);
            },
            undo: () => {
              /* server delete only fires on commit; nothing to roll back */
            },
            addBack: () => dropPending(task.id),
          });
        }}
      />

      {/* Draft panel — opens when the user clicks "Add task" in a column.
          Pre-linked to this project via draftTask.projects. */}
      <TaskDetailPanel
        task={draftTask}
        projects={projects}
        areas={areas}
        onCreateProject={handleCreateProject}
        open={!!draftTask}
        onClose={() => setDraftStatus(null)}
        addOptimistic={addOptimistic}
        mode="create"
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
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
