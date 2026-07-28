import "server-only";

import {
  getJournalEntriesForUserCached,
  getSidebarTreeCached,
  loadHabitsCached,
} from "@/lib/db/cached";
import type { SearchSnapshot } from "@/lib/search";
import {
  getSearchCaptures,
  getSearchPages,
  getSearchTasks,
} from "@/lib/search/snapshot-queries";
import { format } from "date-fns";

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
  // Tasks, captures and pages go through `snapshot-queries`, which reads only
  // the fields the index actually uses. The entity helpers this used to call
  // return whole entities, and the eight extra statements that cost bought
  // hashtag pills, people mentions and custom fields that the index throws
  // away. The tree, the journal and the habits are already minimal, so they
  // keep the cached wrappers, which also dedupe them against any server render
  // in the same request.
  const [tree, tasks, captures, pages, journal, habitNodes] = await Promise.all([
    getSidebarTreeCached(userId, true),
    getSearchTasks(userId),
    getSearchCaptures(userId, CAPTURE_LIMIT),
    getSearchPages(userId),
    getJournalEntriesForUserCached(userId),
    loadHabitsCached(userId),
  ]);

  const areas = tree.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji }));
  const projects = tree.flatMap((a) =>
    a.projects.map((p) => ({ id: p.id, name: p.name, areaId: a.id }))
  );

  return {
    areas,
    projects,
    // tasks, captures and pages already arrive in the snapshot's own shape.
    tasks,
    captures,
    pages,
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
