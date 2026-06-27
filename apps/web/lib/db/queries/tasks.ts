import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, tasksProjects, projects } from "@/lib/db/schema";
import type { RecurrenceRule } from "@/lib/tasks/recurrence";

export interface TaskWithProjects {
  id: string;
  title: string;
  notes: string | null;
  priority: "P∞" | "P1" | "P2" | "P3";
  status: "not started" | "up next" | "in progress" | "almost done" | "lesno";
  dueDate: string | null;
  kanbanPosition: number;
  completedAt: Date | null;
  createdAt: Date;
  /** Issue #101 — Notion-style URL property (NULL = unset). */
  url: string | null;
  /**
   * Issue #144 — recurrence rule (NULL = one-off task). When set, this row is a
   * recurring-task series whose due_date advances to the next occurrence on
   * completion/skip. Distinct from Habits.
   */
  recurrence: RecurrenceRule | null;
  projects: { id: string; name: string }[];
}

/**
 * All tasks for user with their linked projects (for /tasks page initial render).
 * Sorted by status (enum order via kanbanPosition within status).
 */
export async function getAllTasksForUser(
  userId: string,
): Promise<TaskWithProjects[]> {
  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.status), asc(tasks.kanbanPosition), asc(tasks.createdAt));

  if (taskRows.length === 0) return [];

  const taskIds = taskRows.map((t) => t.id);

  const links = await db
    .select({
      taskId: tasksProjects.taskId,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(tasksProjects)
    .innerJoin(projects, eq(projects.id, tasksProjects.projectId))
    .where(
      and(
        eq(tasksProjects.userId, userId),
        inArray(tasksProjects.taskId, taskIds),
      ),
    );

  const linksByTask = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    const list = linksByTask.get(l.taskId) ?? [];
    list.push({ id: l.projectId, name: l.projectName });
    linksByTask.set(l.taskId, list);
  }

  return taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    priority: t.priority as TaskWithProjects["priority"],
    status: t.status as TaskWithProjects["status"],
    dueDate: t.dueDate,
    kanbanPosition: t.kanbanPosition,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    url: t.url,
    recurrence: (t.recurrence as RecurrenceRule | null) ?? null,
    projects: linksByTask.get(t.id) ?? [],
  }));
}

/**
 * Tasks linked to a specific project (for project detail page Tasks column — TASK-08).
 */
export async function getTasksForProject(
  userId: string,
  projectId: string,
): Promise<TaskWithProjects[]> {
  const rows = await db
    .select({ task: tasks })
    .from(tasksProjects)
    .innerJoin(tasks, eq(tasks.id, tasksProjects.taskId))
    .where(
      and(
        eq(tasksProjects.userId, userId),
        eq(tasksProjects.projectId, projectId),
      ),
    )
    .orderBy(asc(tasks.status), asc(tasks.kanbanPosition));

  return rows.map((r) => ({
    id: r.task.id,
    title: r.task.title,
    notes: r.task.notes,
    priority: r.task.priority as TaskWithProjects["priority"],
    status: r.task.status as TaskWithProjects["status"],
    dueDate: r.task.dueDate,
    kanbanPosition: r.task.kanbanPosition,
    completedAt: r.task.completedAt,
    createdAt: r.task.createdAt,
    url: r.task.url,
    recurrence: (r.task.recurrence as RecurrenceRule | null) ?? null,
    projects: [{ id: projectId, name: "" }],
  }));
}
