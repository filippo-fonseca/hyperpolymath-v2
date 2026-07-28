import "server-only";

import { db } from "@/lib/db";
import {
  captures,
  capturesHashtags,
  hashtags,
  pages,
  projects,
  tasks,
  tasksProjects,
} from "@/lib/db/schema";
import type { SearchSnapshot } from "@/lib/search";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

/**
 * The search snapshot's own reads.
 *
 * The snapshot used to be assembled from the same helpers the feature pages
 * use: `getAllTasksForUser`, `getCapturesForUser`, `getPagesForUser`. Those
 * helpers return whole entities, because a task row on /tasks renders its
 * hashtag pills and its @-mentioned people, and a page row in the wiki renders
 * its custom fields. The search index renders none of that. It reads six fields
 * off a task, five off a capture and six off a page, and it threw the rest
 * away.
 *
 * The cost of throwing it away was eight Postgres statements per snapshot: the
 * task hashtag and people fan-outs, the capture project and people fan-outs,
 * and the page project-link, field-definition and field-value fan-outs. The
 * snapshot is fetched on every cold (app) load and again, debounced, on every
 * realtime write, so it is the single largest block of statements the app
 * issues.
 *
 * These queries are deliberately shaped like the ones they replace rather than
 * minimally: same FROM, same JOIN, same WHERE, same ORDER BY, only a narrower
 * column list. Neither the old link queries nor these have an ORDER BY, so row
 * order is plan-dependent, and `buildSearchIndex` takes the FIRST resolvable
 * project of a task as its label. Keeping the join shape identical keeps the
 * plan, and therefore that label, identical.
 *
 * The output of each function is exactly the slice of `SearchSnapshot` it is
 * named for. Nothing downstream can tell the difference.
 */

/** Tasks, plus their project ids. Two statements where the entity helper cost four. */
export async function getSearchTasks(userId: string): Promise<SearchSnapshot["tasks"]> {
  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      status: tasks.status,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.status), asc(tasks.kanbanPosition), asc(tasks.createdAt));

  if (taskRows.length === 0) return [];
  const taskIds = taskRows.map((t) => t.id);

  const links = await db
    .select({ taskId: tasksProjects.taskId, projectId: projects.id })
    .from(tasksProjects)
    .innerJoin(projects, eq(projects.id, tasksProjects.projectId))
    .where(and(eq(tasksProjects.userId, userId), inArray(tasksProjects.taskId, taskIds)));

  const projectIdsByTask = new Map<string, string[]>();
  for (const l of links) {
    const list = projectIdsByTask.get(l.taskId) ?? [];
    list.push(l.projectId);
    projectIdsByTask.set(l.taskId, list);
  }

  return taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate,
    createdAt: t.createdAt.toISOString(),
    projectIds: projectIdsByTask.get(t.id) ?? [],
  }));
}

/** Captures, plus their hashtag display names. Two statements where the entity helper cost four. */
export async function getSearchCaptures(
  userId: string,
  limit: number
): Promise<SearchSnapshot["captures"]> {
  const captureRows = await db
    .select({
      id: captures.id,
      content: captures.content,
      createdAt: captures.createdAt,
      updatedAt: captures.updatedAt,
    })
    .from(captures)
    .where(eq(captures.userId, userId))
    .orderBy(desc(captures.createdAt))
    .limit(limit);

  if (captureRows.length === 0) return [];
  const captureIds = captureRows.map((c) => c.id);

  const tagLinks = await db
    .select({
      captureId: capturesHashtags.captureId,
      displayName: hashtags.displayName,
    })
    .from(capturesHashtags)
    .innerJoin(hashtags, eq(hashtags.id, capturesHashtags.hashtagId))
    .where(
      and(eq(capturesHashtags.userId, userId), inArray(capturesHashtags.captureId, captureIds))
    );

  const tagsByCapture = new Map<string, string[]>();
  for (const t of tagLinks) {
    const list = tagsByCapture.get(t.captureId) ?? [];
    list.push(t.displayName);
    tagsByCapture.set(t.captureId, list);
  }

  return captureRows.map((c) => ({
    id: c.id,
    text: c.content,
    tags: tagsByCapture.get(c.id) ?? [],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

/** Pages. One statement where the entity helper cost four, sometimes five. */
export async function getSearchPages(userId: string): Promise<SearchSnapshot["pages"]> {
  const rows = await db
    .select({
      id: pages.id,
      title: pages.title,
      content: pages.content,
      emoji: pages.emoji,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
    })
    .from(pages)
    .where(eq(pages.userId, userId))
    .orderBy(desc(pages.pinned), desc(pages.updatedAt));

  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    emoji: p.emoji,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}
