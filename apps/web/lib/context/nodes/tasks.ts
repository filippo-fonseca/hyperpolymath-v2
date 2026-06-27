/**
 * Snapshot loader: tasks.
 *
 * Cap: 200 most-recent non-lesno tasks where no_export=false. The window is
 * 250 rows so the excluded count is a reasonable approximation of "private
 * tasks in your recent activity" rather than the universe (full-history
 * counts would bloat the meta and don't match the snapshot's recency window).
 *
 * Projects: a single SELECT against tasks_projects scoped by user_id; the
 * junction carries denormalized user_id so this is a clean owner-only read
 * (no JOIN through tasks needed). Composite-PK on (taskId, projectId).
 */

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { hashtags, tasks as tasksTable, tasksHashtags, tasksProjects } from "@/lib/db/schema";
import type { Node } from "../types";

export type DB = typeof defaultDb;

const TASKS_CAP = 200;
const TASKS_QUERY_WINDOW = 250;

function dateToISO(d: Date | string | null): string | null {
  if (d === null) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

type TaskPriority = "P∞" | "P1" | "P2" | "P3";
type TaskStatus = "not started" | "up next" | "in progress" | "almost done" | "lesno";

export async function loadTasks(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      priority: tasksTable.priority,
      status: tasksTable.status,
      dueDate: tasksTable.dueDate,
      noExport: tasksTable.noExport,
    })
    .from(tasksTable)
    .where(and(eq(tasksTable.userId, userId), ne(tasksTable.status, "lesno")))
    .orderBy(desc(tasksTable.updatedAt))
    .limit(TASKS_QUERY_WINDOW);

  const projectLinks = await db
    .select({
      taskId: tasksProjects.taskId,
      projectId: tasksProjects.projectId,
    })
    .from(tasksProjects)
    .where(eq(tasksProjects.userId, userId));

  const byTask = new Map<string, string[]>();
  for (const link of projectLinks) {
    const arr = byTask.get(link.taskId) ?? [];
    arr.push(link.projectId);
    byTask.set(link.taskId, arr);
  }

  // Issue #159 — linked hashtag display names per task (scoped owner-only via
  // the denormalized user_id on the junction). Drives both the node `tags`
  // array and the task_tagged edges.
  const rowIds = rows.map((r) => r.id);
  const tagsByTask = new Map<string, string[]>();
  if (rowIds.length > 0) {
    const tagLinks = await db
      .select({ taskId: tasksHashtags.taskId, displayName: hashtags.displayName })
      .from(tasksHashtags)
      .innerJoin(hashtags, eq(hashtags.id, tasksHashtags.hashtagId))
      .where(and(eq(tasksHashtags.userId, userId), inArray(tasksHashtags.taskId, rowIds)));
    for (const link of tagLinks) {
      const arr = tagsByTask.get(link.taskId) ?? [];
      arr.push(link.displayName);
      tagsByTask.set(link.taskId, arr);
    }
  }

  let excluded = 0;
  const nodes: Node[] = [];
  for (const r of rows) {
    if (r.noExport) {
      excluded++;
      continue;
    }
    if (nodes.length >= TASKS_CAP) continue;
    nodes.push({
      type: "task" as const,
      id: r.id,
      title: r.title,
      priority: r.priority as TaskPriority,
      status: r.status as TaskStatus,
      dueDate: dateToISO(r.dueDate),
      projectIds: byTask.get(r.id) ?? [],
      tags: tagsByTask.get(r.id) ?? [],
    });
  }

  return { nodes, excluded };
}
