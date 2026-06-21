import { db } from "@/lib/db";
import { pageFolders, pages, pagesProjects, projects } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

/** A page's link to one project. Folder placement is now page-level, not per-link. */
export interface PageProjectLink {
  id: string;
  name: string;
}

export interface PageWithProjects {
  id: string;
  title: string;
  content: string;
  contentJson: unknown;
  emoji: string | null;
  pinned: boolean;
  /** When true, the page is excluded from the snapshot, MCP export, and graph. */
  noExport: boolean;
  /** The folder this page sits in globally (Phase 21: one folder per page). */
  folderId: string | null;
  folderName: string | null;
  createdAt: Date;
  updatedAt: Date;
  projects: PageProjectLink[];
}

const PAGE_COLS = {
  id: pages.id,
  title: pages.title,
  content: pages.content,
  contentJson: pages.contentJson,
  emoji: pages.emoji,
  pinned: pages.pinned,
  noExport: pages.noExport,
  folderId: pages.folderId,
  folderName: pageFolders.name,
  createdAt: pages.createdAt,
  updatedAt: pages.updatedAt,
} as const;

type PageRow = {
  id: string;
  title: string;
  content: string;
  contentJson: unknown;
  emoji: string | null;
  pinned: boolean;
  noExport: boolean;
  folderId: string | null;
  folderName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * All pages for a user, ordered pinned-first then most-recently-updated.
 * Optionally filter to an explicit set of IDs (search results / project slice).
 *
 * Folder placement is read directly from pages.folder_id (Phase 21 — a page
 * sits in one folder globally), left-joined to page_folders for the name.
 */
export async function getPagesForUser(
  userId: string,
  opts: { ids?: string[] } = {},
): Promise<PageWithProjects[]> {
  let pageRows: PageRow[];

  if (opts.ids !== undefined) {
    if (opts.ids.length === 0) return [];
    pageRows = await db
      .select(PAGE_COLS)
      .from(pages)
      .leftJoin(pageFolders, eq(pageFolders.id, pages.folderId))
      .where(and(eq(pages.userId, userId), inArray(pages.id, opts.ids)))
      .orderBy(desc(pages.pinned), desc(pages.updatedAt));
  } else {
    pageRows = await db
      .select(PAGE_COLS)
      .from(pages)
      .leftJoin(pageFolders, eq(pageFolders.id, pages.folderId))
      .where(eq(pages.userId, userId))
      .orderBy(desc(pages.pinned), desc(pages.updatedAt));
  }

  if (pageRows.length === 0) return [];
  const pageIds = pageRows.map((p) => p.id);

  const projLinks = await db
    .select({
      pageId: pagesProjects.pageId,
      id: projects.id,
      name: projects.name,
    })
    .from(pagesProjects)
    .innerJoin(projects, eq(projects.id, pagesProjects.projectId))
    .where(
      and(
        eq(pagesProjects.userId, userId),
        inArray(pagesProjects.pageId, pageIds),
      ),
    );

  const projsByPage = new Map<string, PageProjectLink[]>();
  for (const p of projLinks) {
    const list = projsByPage.get(p.pageId) ?? [];
    list.push({ id: p.id, name: p.name });
    projsByPage.set(p.pageId, list);
  }

  return pageRows.map((p) => ({
    ...p,
    projects: projsByPage.get(p.id) ?? [],
  }));
}

/**
 * Single page by id, scoped to userId.
 */
export async function getPageById(
  userId: string,
  id: string,
): Promise<PageWithProjects | null> {
  const rows = await getPagesForUser(userId, { ids: [id] });
  return rows[0] ?? null;
}

/**
 * Pages linked to a specific project.
 */
export async function getPagesForProject(
  userId: string,
  projectId: string,
): Promise<PageWithProjects[]> {
  const rows = await db
    .select({ id: pages.id })
    .from(pagesProjects)
    .innerJoin(pages, eq(pages.id, pagesProjects.pageId))
    .where(
      and(
        eq(pagesProjects.userId, userId),
        eq(pagesProjects.projectId, projectId),
      ),
    )
    .orderBy(desc(pages.updatedAt))
    .limit(100);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  return getPagesForUser(userId, { ids });
}
