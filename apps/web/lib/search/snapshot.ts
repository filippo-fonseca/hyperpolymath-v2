import "server-only";

import { format } from "date-fns";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { getJournalEntriesForUser } from "@/lib/db/queries/journal";
import { getPagesForUser } from "@/lib/db/queries/pages";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { loadHabits } from "@/lib/context/nodes/habits";
import type { SearchSnapshot } from "@/lib/search";

/** Format a "YYYY-MM-DD" calendar day at local time (avoids UTC day-shift). */
function journalTitle(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return format(parsed, "EEEE, MMM d, yyyy");
}

/** Index a generous slice of captures (perf target covers up to ~1000 nodes). */
const CAPTURE_LIMIT = 1000;

/**
 * Assemble the lean, denormalized snapshot the global-search engine indexes.
 * Reuses the same per-domain queries the feature pages use, so search never
 * drifts from what the rest of the app shows. Includes archived areas/projects
 * so search can still surface them.
 */
export async function getSearchSnapshot(userId: string): Promise<SearchSnapshot> {
  const [tree, tasks, captures, pages, journal, habitNodes] = await Promise.all([
    getSidebarTree(userId, true),
    getAllTasksForUser(userId),
    getCapturesForUser(userId, { limit: CAPTURE_LIMIT }),
    getPagesForUser(userId),
    getJournalEntriesForUser(userId),
    loadHabits(userId),
  ]);

  const areas = tree.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji }));
  const projects = tree.flatMap((a) =>
    a.projects.map((p) => ({ id: p.id, name: p.name, areaId: a.id }))
  );

  return {
    areas,
    projects,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      createdAt: t.createdAt.toISOString(),
      projectIds: t.projects.map((p) => p.id),
    })),
    captures: captures.map((c) => ({
      id: c.id,
      text: c.content,
      tags: c.hashtags.map((h) => h.displayName),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    pages: pages.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      emoji: p.emoji,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    journalEntries: journal.map((j) => ({
      id: j.id,
      title: journalTitle(j.date),
      body: [j.mainResponse, j.notesSection].filter(Boolean).join("\n\n"),
      date: j.date,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    })),
    habits: habitNodes.nodes
      .filter((n): n is Extract<typeof n, { type: "habit" }> => n.type === "habit")
      .map((h) => ({ id: h.id, name: h.name, currentStreak: h.currentStreak })),
  };
}
