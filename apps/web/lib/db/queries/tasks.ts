import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tasks,
  tasksProjects,
  tasksHashtags,
  hashtags,
  peopleReferences,
  people,
  projects,
} from "@/lib/db/schema";
import type { RecurrenceRule } from "@/lib/tasks/recurrence";

export interface TaskWithProjects {
  id: string;
  title: string;
  notes: string | null;
  priority: "P∞" | "P1" | "P2" | "P3";
  status: "not started" | "up next" | "in progress" | "almost done" | "lesno";
  dueDate: string | null;
  /** Optional time-of-day for the due date, always "HH:MM" 24h (NULL = whole-day). */
  dueTime: string | null;
  /**
   * Issue #396 — reminder offsets in minutes before the due moment, sorted
   * ascending, each from the fixed preset ladder. Empty = no reminders.
   */
  reminderOffsetsMin: number[];
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
  /** Issue #159 — linked #hashtags (canonical name + first-seen displayName). */
  hashtags: { id: string; name: string; displayName: string }[];
  /** Issue #159 — @-mentioned people (from people_references, fromType "task"). */
  people: { id: string; name: string }[];
  /**
   * Linked-people derivation marker (ISO string, or null when never derived).
   * The detail panel gates its lazy on-open people backfill on this being null.
   */
  peopleDerivedAt: string | null;
}

/** Postgres `time` serializes as "HH:MM:SS"; clients always see "HH:MM". */
export function normalizeDueTime(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
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

  // The three link fan-outs below depend only on `taskIds`, never on each
  // other, so they go out as one wave instead of three serial round trips.
  // With the pooler that turns 4 round trips into 2 for the /tasks render.
  const [links, tagRows, peopleRows] = await Promise.all([
    db
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
      ),

    // Issue #159 — linked hashtags per task.
    db
      .select({
        taskId: tasksHashtags.taskId,
        id: hashtags.id,
        name: hashtags.name,
        displayName: hashtags.displayName,
      })
      .from(tasksHashtags)
      .innerJoin(hashtags, eq(hashtags.id, tasksHashtags.hashtagId))
      .where(
        and(
          eq(tasksHashtags.userId, userId),
          inArray(tasksHashtags.taskId, taskIds),
        ),
      ),

    // Issue #159 — @-mentioned people per task (polymorphic people_references).
    db
      .select({
        taskId: peopleReferences.fromId,
        id: people.id,
        name: people.name,
      })
      .from(peopleReferences)
      .innerJoin(people, eq(people.id, peopleReferences.personId))
      .where(
        and(
          eq(peopleReferences.userId, userId),
          eq(peopleReferences.fromType, "task"),
          inArray(peopleReferences.fromId, taskIds),
        ),
      ),
  ]);

  const linksByTask = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    const list = linksByTask.get(l.taskId) ?? [];
    list.push({ id: l.projectId, name: l.projectName });
    linksByTask.set(l.taskId, list);
  }

  const tagsByTask = new Map<
    string,
    { id: string; name: string; displayName: string }[]
  >();
  for (const r of tagRows) {
    const list = tagsByTask.get(r.taskId) ?? [];
    list.push({ id: r.id, name: r.name, displayName: r.displayName });
    tagsByTask.set(r.taskId, list);
  }

  const peopleByTask = new Map<string, { id: string; name: string }[]>();
  for (const r of peopleRows) {
    const list = peopleByTask.get(r.taskId) ?? [];
    list.push({ id: r.id, name: r.name });
    peopleByTask.set(r.taskId, list);
  }

  return taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    priority: t.priority as TaskWithProjects["priority"],
    status: t.status as TaskWithProjects["status"],
    dueDate: t.dueDate,
    dueTime: normalizeDueTime(t.dueTime),
    reminderOffsetsMin: t.reminderOffsetsMin ?? [],
    kanbanPosition: t.kanbanPosition,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    url: t.url,
    recurrence: (t.recurrence as RecurrenceRule | null) ?? null,
    projects: linksByTask.get(t.id) ?? [],
    hashtags: tagsByTask.get(t.id) ?? [],
    people: peopleByTask.get(t.id) ?? [],
    peopleDerivedAt: t.peopleDerivedAt ? t.peopleDerivedAt.toISOString() : null,
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
    dueTime: normalizeDueTime(r.task.dueTime),
    reminderOffsetsMin: r.task.reminderOffsetsMin ?? [],
    kanbanPosition: r.task.kanbanPosition,
    completedAt: r.task.completedAt,
    createdAt: r.task.createdAt,
    url: r.task.url,
    recurrence: (r.task.recurrence as RecurrenceRule | null) ?? null,
    projects: [{ id: projectId, name: "" }],
    // Project detail view doesn't render tag/person chips; keep the query lean.
    hashtags: [],
    people: [],
    peopleDerivedAt: r.task.peopleDerivedAt ? r.task.peopleDerivedAt.toISOString() : null,
  }));
}
