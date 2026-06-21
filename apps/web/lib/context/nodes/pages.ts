/**
 * Snapshot loader: pages.
 *
 * Cap: 50 most-recent pages where no_export=false, ordered by updated_at DESC.
 * Content >2000 chars gets a plain-text summary (first 300 chars, markdown
 * syntax stripped). Full content is always included for MCP consumers.
 *
 * Phase 29: each page node carries its EFFECTIVE project set (its own direct
 * pages_projects links UNION the effective project set inherited from its
 * ancestor folders) plus its folder placement (folderId) and root-first folder
 * path names (folderPath). The effective set feeds the page_in_project edge
 * derivation, so inherited memberships show up in the knowledge graph too.
 */

import { db as defaultDb } from "@/lib/db";
import { pagesProjects, pages as pagesTable } from "@/lib/db/schema";
import { getFoldersWithProjects } from "@/lib/db/queries/folders";
import {
  getEffectiveProjectIds,
  type FolderWithProjects,
} from "@/lib/pages/folder-projects";
import { desc, eq } from "drizzle-orm";
import type { Node } from "../types";

export type DB = typeof defaultDb;

const PAGES_CAP = 50;
const PAGES_QUERY_WINDOW = 75;
const SUMMARY_THRESHOLD = 2000;
const SUMMARY_LENGTH = 300;

function stripMarkdown(text: string): string {
  return text.replace(/[#*`_[\]>~]/g, "");
}

function dateToISO(d: Date | string | null): string {
  if (d === null) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

/**
 * Walk a folder's ancestor chain to the root and return the folder names in
 * root-first order (the path that leads to the folder). Returns an empty array
 * when the page is unfiled. Cycle-guarded with a visited set, mirroring
 * folderPathNames in lib/pages/markdown-export.ts.
 */
function folderPathNames(
  folderId: string | null,
  folderMap: Map<string, FolderWithProjects>,
): string[] {
  if (!folderId) return [];
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: string | null = folderId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const node = folderMap.get(current);
    if (!node) break;
    chain.push(node.name);
    current = node.parentId;
  }
  return chain.reverse();
}

export async function loadPages(
  userId: string,
  db: DB = defaultDb
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: pagesTable.id,
      title: pagesTable.title,
      content: pagesTable.content,
      emoji: pagesTable.emoji,
      folderId: pagesTable.folderId,
      createdAt: pagesTable.createdAt,
      updatedAt: pagesTable.updatedAt,
      noExport: pagesTable.noExport,
    })
    .from(pagesTable)
    .where(eq(pagesTable.userId, userId))
    .orderBy(desc(pagesTable.updatedAt))
    .limit(PAGES_QUERY_WINDOW);

  const projectLinks = await db
    .select({
      pageId: pagesProjects.pageId,
      projectId: pagesProjects.projectId,
    })
    .from(pagesProjects)
    .where(eq(pagesProjects.userId, userId));

  const projectsByPage = new Map<string, string[]>();
  for (const link of projectLinks) {
    const arr = projectsByPage.get(link.pageId) ?? [];
    arr.push(link.projectId);
    projectsByPage.set(link.pageId, arr);
  }

  // Load folders once and index them so the per-page walk (effective project set
  // + folder path) is a pure in-memory lookup. The folder/link count per user is
  // small, so this single read is cheaper than per-page round-trips.
  const folders = await getFoldersWithProjects(userId);
  const folderMap = new Map<string, FolderWithProjects>(
    folders.map((f) => [f.id, f]),
  );

  let excluded = 0;
  const nodes: Node[] = [];
  for (const r of rows) {
    if (r.noExport) {
      excluded++;
      continue;
    }
    if (nodes.length >= PAGES_CAP) continue;
    const summary =
      r.content.length > SUMMARY_THRESHOLD
        ? stripMarkdown(r.content).slice(0, SUMMARY_LENGTH)
        : undefined;

    // Effective project set: the page's own direct links unioned with the
    // effective set of the folder it sits in (which itself cascades from its
    // ancestors). Dedupe via a Set so a project linked both directly and through
    // the folder appears once.
    const directProjectIds = projectsByPage.get(r.id) ?? [];
    const inheritedProjectIds = r.folderId
      ? getEffectiveProjectIds(r.folderId, folderMap)
      : [];
    const effectiveProjectIds = [
      ...new Set([...directProjectIds, ...inheritedProjectIds]),
    ];

    nodes.push({
      type: "page" as const,
      id: r.id,
      title: r.title,
      content: r.content,
      emoji: r.emoji,
      projectIds: effectiveProjectIds,
      folderId: r.folderId ?? null,
      folderPath: folderPathNames(r.folderId, folderMap),
      createdAt: dateToISO(r.createdAt),
      updatedAt: dateToISO(r.updatedAt),
      ...(summary !== undefined ? { summary } : {}),
    });
  }

  return { nodes, excluded };
}
