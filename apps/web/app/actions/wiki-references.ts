"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * On-demand entity search for the wiki "@" / "[[" reference picker (issue #9,
 * "Zyndicate, finally"). Searches across the user's areas, projects, tasks, and
 * pages so a page can reference any of them inline; people are searched
 * separately via searchPeopleForCurrentUser (people get richer email matching).
 *
 * Fetches live per keystroke — like the people mention menu — so the picker
 * works without first warming any tab's cache and matches against full titles.
 * Returns [] when unauthenticated rather than throwing, so the menu degrades
 * quietly.
 *
 * Results are intentionally lean (kind + id + label + optional emoji) so the
 * picker can insert an entityReference inline node that persists in the page's
 * content_json and renders as a styled chip that navigates to the entity.
 */

/** A referenceable, non-person app entity kind. */
export type WikiReferenceKind = "area" | "project" | "task" | "page";

/** One candidate row the wiki reference picker can insert. */
export interface WikiReferenceCandidate {
  kind: WikiReferenceKind;
  id: string;
  /** Display label (area/project name, task/page title). */
  label: string;
  /** Leading emoji where the entity carries one (areas, pages). */
  emoji: string | null;
  /** Short contextual subtext, e.g. the parent area for a project. */
  context: string | null;
}

const MAX_PER_KIND = 6;

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

/**
 * Search the current user's areas, projects, tasks, and pages for the picker.
 * An empty/whitespace query returns a small recent-ish slice per kind so the
 * menu is useful the instant it opens (BlockNote opens it on the bare trigger).
 */
export async function searchEntitiesForReference(
  rawQuery: string,
): Promise<WikiReferenceCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return [];
  const userId = data.claims.sub;

  const query = rawQuery.trim().toLowerCase();

  // Pull the live entity sets server-side. The sidebar tree gives areas +
  // projects (with parent-area context) in one shot; tasks and pages come from
  // their own query helpers. All are already scoped to the user.
  const [{ getSidebarTree }, { getAllTasksForUser }, { getPagesForUser }] =
    await Promise.all([
      import("@/lib/db/queries/sidebar"),
      import("@/lib/db/queries/tasks"),
      import("@/lib/db/queries/pages"),
    ]);

  const [areasTree, tasks, pages] = await Promise.all([
    getSidebarTree(userId, false),
    getAllTasksForUser(userId),
    getPagesForUser(userId),
  ]);

  const out: WikiReferenceCandidate[] = [];

  // Areas.
  const areaHits: WikiReferenceCandidate[] = [];
  for (const area of areasTree) {
    if (query && !matches(area.name, query)) continue;
    areaHits.push({
      kind: "area",
      id: area.id,
      label: area.name,
      emoji: area.emoji,
      context: null,
    });
  }
  out.push(...areaHits.slice(0, MAX_PER_KIND));

  // Projects (with their parent area as context).
  const projectHits: WikiReferenceCandidate[] = [];
  for (const area of areasTree) {
    for (const project of area.projects) {
      if (query && !matches(project.name, query)) continue;
      projectHits.push({
        kind: "project",
        id: project.id,
        label: project.name,
        emoji: null,
        context: area.name,
      });
    }
  }
  out.push(...projectHits.slice(0, MAX_PER_KIND));

  // Tasks.
  const taskHits: WikiReferenceCandidate[] = [];
  for (const task of tasks) {
    if (query && !matches(task.title, query)) continue;
    const parent = task.projects[0]?.name ?? null;
    taskHits.push({
      kind: "task",
      id: task.id,
      label: task.title,
      emoji: null,
      context: parent,
    });
  }
  out.push(...taskHits.slice(0, MAX_PER_KIND));

  // Pages (skip empty-title untitled pages from the menu — nothing to show).
  const pageHits: WikiReferenceCandidate[] = [];
  for (const page of pages) {
    const title = page.title.trim();
    if (!title) continue;
    if (query && !matches(title, query)) continue;
    pageHits.push({
      kind: "page",
      id: page.id,
      label: title,
      emoji: page.emoji,
      context: null,
    });
  }
  out.push(...pageHits.slice(0, MAX_PER_KIND));

  return out;
}
