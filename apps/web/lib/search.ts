import { format } from "date-fns";
import { entityHref } from "@/lib/entity-href";

/**
 * Global search engine — pure, synchronous, zero UI/React dependencies.
 *
 * Two surfaces consume this: the full /search page and the Cmd+K dropdown.
 * They share one index (built once per snapshot) and one matcher. Debouncing
 * lives in the UI layer (useSearch hook), never here.
 *
 * Matching is case-insensitive substring over `searchText` (title + tags +
 * preview blob). Captures additionally match on their tags so searching a
 * hashtag surfaces a capture even when the word is absent from its body.
 */

export type SearchType = "area" | "project" | "task" | "capture" | "page" | "journal" | "habit";

export interface SearchEntry {
  id: string;
  type: SearchType;
  title: string;
  /** Lowercased blob used for substring matching: title + tags + preview. */
  searchText: string;
  /** First ~80 chars of a capture body (captures only). */
  preview?: string;
  /** Hierarchy, e.g. ['Cadex 👟', 'MVP'] for a task. */
  breadcrumb: string[];
  /** Inline meta, e.g. 'P1 · due 6/19' for a task. */
  meta?: string;
  tags?: string[];
  href: string;
  /** ISO string for recency ranking. */
  updatedAt?: string;
  /** ISO date used to sort tasks with a due date ascending. */
  dueDate?: string;
}

export interface SearchResults {
  tasks: SearchEntry[];
  captures: SearchEntry[];
  pages: SearchEntry[];
  journal: SearchEntry[];
  projects: SearchEntry[];
  areas: SearchEntry[];
  habits: SearchEntry[];
  total: number;
}

/**
 * Lean, denormalized view of the user's data. Decoupled from Drizzle row
 * shapes on purpose so the engine stays trivially testable.
 */
export interface SearchSnapshot {
  areas: { id: string; name: string; emoji: string | null }[];
  projects: { id: string; name: string; areaId: string }[];
  tasks: {
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate: string | null;
    createdAt: string;
    projectIds: string[];
  }[];
  captures: {
    id: string;
    text: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }[];
  pages: {
    id: string;
    title: string;
    content: string;
    emoji: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  journalEntries: {
    id: string;
    title: string;
    body: string;
    date: string;
    createdAt: string;
    updatedAt: string;
  }[];
  habits: { id: string; name: string; currentStreak: number }[];
}

const PREVIEW_LEN = 80;

function emptyResults(): SearchResults {
  return { tasks: [], captures: [], pages: [], journal: [], projects: [], areas: [], habits: [], total: 0 };
}

function areaLabel(name: string, emoji: string | null): string {
  return emoji ? `${name} ${emoji}` : name;
}

function safeFormat(iso: string | null | undefined, pattern: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, pattern);
}

function taskMeta(priority: string, dueDate: string | null): string {
  const due = safeFormat(dueDate, "M/d");
  return due ? `${priority} · due ${due}` : priority;
}

/**
 * Build a flat in-memory index from a snapshot. O(n) over all nodes; targets
 * < 50ms for ~200 nodes. Breadcrumbs are resolved here once, not per query.
 */
export function buildSearchIndex(snapshot: SearchSnapshot): SearchEntry[] {
  const areaById = new Map(snapshot.areas.map((a) => [a.id, a]));
  const projectById = new Map(snapshot.projects.map((p) => [p.id, p]));

  const entries: SearchEntry[] = [];

  for (const a of snapshot.areas) {
    const title = areaLabel(a.name, a.emoji);
    entries.push({
      id: a.id,
      type: "area",
      title,
      searchText: title.toLowerCase(),
      breadcrumb: [],
      href: entityHref({ kind: "area", id: a.id }),
    });
  }

  for (const p of snapshot.projects) {
    const area = areaById.get(p.areaId);
    const breadcrumb = area ? [areaLabel(area.name, area.emoji)] : [];
    entries.push({
      id: p.id,
      type: "project",
      title: p.name,
      searchText: p.name.toLowerCase(),
      breadcrumb,
      href: entityHref({ kind: "project", id: p.id }),
    });
  }

  for (const t of snapshot.tasks) {
    const firstProject = t.projectIds.map((id) => projectById.get(id)).find(Boolean);
    const area = firstProject ? areaById.get(firstProject.areaId) : undefined;
    const breadcrumb: string[] = [];
    if (area) breadcrumb.push(areaLabel(area.name, area.emoji));
    if (firstProject) breadcrumb.push(firstProject.name);
    entries.push({
      id: t.id,
      type: "task",
      title: t.title,
      searchText: t.title.toLowerCase(),
      breadcrumb,
      meta: taskMeta(t.priority, t.dueDate),
      href: entityHref({ kind: "task", id: t.id }),
      updatedAt: t.createdAt,
      dueDate: t.dueDate ?? undefined,
    });
  }

  for (const c of snapshot.captures) {
    const body = c.text.trim();
    const preview = body.length > PREVIEW_LEN ? `${body.slice(0, PREVIEW_LEN).trimEnd()}…` : body;
    const tagBlob = c.tags.join(" ");
    entries.push({
      id: c.id,
      type: "capture",
      title: body,
      searchText: `${body} ${tagBlob}`.toLowerCase(),
      preview,
      breadcrumb: [],
      meta: safeFormat(c.createdAt, "MMM d") ?? undefined,
      tags: c.tags,
      href: entityHref({ kind: "capture", id: c.id }),
      updatedAt: c.updatedAt || c.createdAt,
    });
  }

  for (const p of snapshot.pages) {
    const title = p.title.trim() || "Untitled";
    const displayTitle = p.emoji ? `${title} ${p.emoji}` : title;
    const body = p.content.trim();
    const preview =
      body.length > PREVIEW_LEN ? `${body.slice(0, PREVIEW_LEN).trimEnd()}…` : body || undefined;
    entries.push({
      id: p.id,
      type: "page",
      title: displayTitle,
      searchText: `${title} ${body}`.toLowerCase(),
      preview,
      breadcrumb: [],
      meta: safeFormat(p.updatedAt, "MMM d") ?? undefined,
      href: entityHref({ kind: "page", id: p.id }),
      updatedAt: p.updatedAt || p.createdAt,
    });
  }

  for (const j of snapshot.journalEntries) {
    const title = j.title.trim() || "Journal entry";
    const body = j.body.trim();
    const preview =
      body.length > PREVIEW_LEN ? `${body.slice(0, PREVIEW_LEN).trimEnd()}…` : body || undefined;
    entries.push({
      id: j.id,
      type: "journal",
      title,
      searchText: `${title} ${body}`.toLowerCase(),
      preview,
      breadcrumb: [],
      meta: safeFormat(j.date, "MMM d") ?? undefined,
      href: entityHref({ kind: "journal", date: j.date }),
      updatedAt: j.updatedAt || j.createdAt,
    });
  }

  for (const h of snapshot.habits) {
    entries.push({
      id: h.id,
      type: "habit",
      title: h.name,
      searchText: h.name.toLowerCase(),
      breadcrumb: [],
      meta: h.currentStreak > 0 ? `${h.currentStreak}-day streak` : undefined,
      href: entityHref({ kind: "habit", id: h.id }),
    });
  }

  return entries;
}

function recencyValue(e: SearchEntry): number {
  if (!e.updatedAt) return 0;
  const t = new Date(e.updatedAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function compareWithinGroup(a: SearchEntry, b: SearchEntry, query: string): number {
  // Title matches outrank body/tag-only matches.
  const aTitle = a.title.toLowerCase().includes(query) ? 1 : 0;
  const bTitle = b.title.toLowerCase().includes(query) ? 1 : 0;
  if (aTitle !== bTitle) return bTitle - aTitle;

  // Tasks with a due date sort by soonest due first.
  if (a.type === "task" && b.type === "task") {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
  }

  // Otherwise most-recent first.
  return recencyValue(b) - recencyValue(a);
}

/**
 * Run a query against a prebuilt index. Returns results grouped by type, each
 * group ranked (title matches first, then recency / soonest-due). Targets
 * < 20ms for 1000 nodes — a single linear scan plus per-group sort.
 */
export function search(index: SearchEntry[], query: string): SearchResults {
  const q = query.trim().toLowerCase();
  if (!q) return emptyResults();

  const results = emptyResults();

  for (const entry of index) {
    const matched =
      entry.searchText.includes(q) ||
      (entry.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false);
    if (!matched) continue;

    switch (entry.type) {
      case "task":
        results.tasks.push(entry);
        break;
      case "capture":
        results.captures.push(entry);
        break;
      case "page":
        results.pages.push(entry);
        break;
      case "journal":
        results.journal.push(entry);
        break;
      case "project":
        results.projects.push(entry);
        break;
      case "area":
        results.areas.push(entry);
        break;
      case "habit":
        results.habits.push(entry);
        break;
    }
  }

  results.tasks.sort((a, b) => compareWithinGroup(a, b, q));
  results.captures.sort((a, b) => compareWithinGroup(a, b, q));
  results.pages.sort((a, b) => compareWithinGroup(a, b, q));
  results.journal.sort((a, b) => compareWithinGroup(a, b, q));
  results.projects.sort((a, b) => compareWithinGroup(a, b, q));
  results.areas.sort((a, b) => compareWithinGroup(a, b, q));
  results.habits.sort((a, b) => compareWithinGroup(a, b, q));

  results.total =
    results.tasks.length +
    results.captures.length +
    results.pages.length +
    results.journal.length +
    results.projects.length +
    results.areas.length +
    results.habits.length;

  return results;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Split text into matched / unmatched segments for <mark> rendering.
 * Case-insensitive, highlights every non-overlapping occurrence of `query`.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) segments.push({ text: text.slice(cursor, idx), match: false });
    segments.push({ text: text.slice(idx, idx + q.length), match: true });
    cursor = idx + q.length;
  }

  return segments;
}

export const SEARCH_TYPE_ORDER: SearchType[] = [
  "task",
  "capture",
  "page",
  "journal",
  "project",
  "area",
  "habit",
];

export const SEARCH_TYPE_LABEL: Record<SearchType, string> = {
  task: "Tasks",
  capture: "Captures",
  page: "Wiki",
  journal: "Journal",
  project: "Projects",
  area: "Areas",
  habit: "Habits",
};

export function resultsForType(results: SearchResults, type: SearchType): SearchEntry[] {
  switch (type) {
    case "task":
      return results.tasks;
    case "capture":
      return results.captures;
    case "page":
      return results.pages;
    case "journal":
      return results.journal;
    case "project":
      return results.projects;
    case "area":
      return results.areas;
    case "habit":
      return results.habits;
  }
}
