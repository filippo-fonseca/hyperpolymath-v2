import { db } from "@/lib/db";
import { getFoldersByEffectiveProject } from "@/lib/db/queries/folders";
import {
  pageFieldDefinitions,
  pageFieldValues,
  pageFolders,
  pages,
  pagesProjects,
  projects,
} from "@/lib/db/schema";
import {
  type PageFieldDefinition,
  type PageFieldType,
  type PageFieldValue,
  type PageFieldWithValue,
  rootFolderId,
} from "@/lib/pages/custom-fields";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";

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
  /** Issue #101 — Notion-style URL property (NULL = unset). */
  url: string | null;
  pinned: boolean;
  /** Notion-style cover/banner image URL (issue #28); NULL = no banner. */
  coverImageUrl: string | null;
  /** Unsplash photographer credit when the cover came from Unsplash; else NULL. */
  coverImageAttribution: string | null;
  /** When true, the page is excluded from the snapshot, MCP export, and graph. */
  noExport: boolean;
  /** The folder this page sits in globally (Phase 21: one folder per page). */
  folderId: string | null;
  folderName: string | null;
  /** Fractional manual-order key for Wiki Explorer sorting. */
  positionKey?: string | null;
  /**
   * Daily Page marker (Phase 30). NULL = a normal page; a yyyy-MM-dd string
   * marks this as the user's Daily Page for that day, which drives the "Daily
   * Page" pill and the "process this page" JARVIS button in the editor.
   */
  dailyDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  projects: PageProjectLink[];
  /**
   * Issue #165 — Notion-style custom fields attached to this page (a
   * page_field_values row joined to its definition), ordered for display.
   */
  fields: PageFieldWithValue[];
}

const PAGE_COLS = {
  id: pages.id,
  title: pages.title,
  content: pages.content,
  contentJson: pages.contentJson,
  emoji: pages.emoji,
  url: pages.url,
  pinned: pages.pinned,
  coverImageUrl: pages.coverImageUrl,
  coverImageAttribution: pages.coverImageAttribution,
  noExport: pages.noExport,
  folderId: pages.folderId,
  folderName: pageFolders.name,
  positionKey: pages.positionKey,
  dailyDate: pages.dailyDate,
  createdAt: pages.createdAt,
  updatedAt: pages.updatedAt,
} as const;

type PageRow = {
  id: string;
  title: string;
  content: string;
  contentJson: unknown;
  emoji: string | null;
  url: string | null;
  pinned: boolean;
  coverImageUrl: string | null;
  coverImageAttribution: string | null;
  noExport: boolean;
  folderId: string | null;
  folderName: string | null;
  positionKey: string | null;
  dailyDate: string | null;
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

  // The project links, the custom-field definitions and the per-page field
  // values are mutually independent (each needs only `userId` / `pageIds`), so
  // they go out as one wave. Only the folder parent map below has to wait, and
  // only when folder-scoped definitions actually exist.
  const [projLinks, defRows, valueRows] = await Promise.all([
    db
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
      ),

    // Custom fields (issue #165). A page's applicable defs = every wiki-scoped def
    // plus the folder-scoped defs of the page's ROOT-ANCESTOR folder (folder defs
    // live on a top-level folder and cascade to descendants). Values + the
    // per-page hidden override are merged in from page_field_values.
    db
      .select({
        id: pageFieldDefinitions.id,
        name: pageFieldDefinitions.name,
        type: pageFieldDefinitions.type,
        scope: pageFieldDefinitions.scope,
        folderId: pageFieldDefinitions.folderId,
        options: pageFieldDefinitions.options,
        allowMultiple: pageFieldDefinitions.allowMultiple,
        orderIndex: pageFieldDefinitions.orderIndex,
      })
      .from(pageFieldDefinitions)
      .where(eq(pageFieldDefinitions.userId, userId))
      .orderBy(asc(pageFieldDefinitions.orderIndex), asc(pageFieldDefinitions.name)),

    db
      .select({
        pageId: pageFieldValues.pageId,
        fieldDefinitionId: pageFieldValues.fieldDefinitionId,
        value: pageFieldValues.value,
        hidden: pageFieldValues.hidden,
      })
      .from(pageFieldValues)
      .where(and(eq(pageFieldValues.userId, userId), inArray(pageFieldValues.pageId, pageIds))),
  ]);

  const projsByPage = new Map<string, PageProjectLink[]>();
  for (const p of projLinks) {
    const list = projsByPage.get(p.pageId) ?? [];
    list.push({ id: p.id, name: p.name });
    projsByPage.set(p.pageId, list);
  }

  const wikiDefs = defRows.filter((d) => d.scope === "wiki");
  const folderDefsByFolder = new Map<string, typeof defRows>();
  for (const d of defRows) {
    if (d.scope === "folder" && d.folderId) {
      const list = folderDefsByFolder.get(d.folderId) ?? [];
      list.push(d);
      folderDefsByFolder.set(d.folderId, list);
    }
  }

  // Folder parent map for root-ancestor resolution (only needed if any folder defs exist).
  let parentById = new Map<string, string | null>();
  if (folderDefsByFolder.size > 0) {
    const folderRows = await db
      .select({ id: pageFolders.id, parentId: pageFolders.parentId })
      .from(pageFolders)
      .where(eq(pageFolders.userId, userId));
    parentById = new Map(folderRows.map((f) => [f.id, f.parentId]));
  }

  const valueByKey = new Map<string, { value: unknown; hidden: boolean }>();
  for (const v of valueRows) {
    valueByKey.set(`${v.pageId}:${v.fieldDefinitionId}`, { value: v.value, hidden: v.hidden });
  }

  const toField = (
    d: (typeof defRows)[number],
    pageId: string,
  ): PageFieldWithValue => {
    const stored = valueByKey.get(`${pageId}:${d.id}`);
    return {
      id: d.id,
      name: d.name,
      type: d.type as PageFieldType,
      scope: d.scope,
      folderId: d.folderId ?? null,
      options: d.options ?? null,
      allowMultiple: d.allowMultiple,
      orderIndex: d.orderIndex,
      value: (stored?.value ?? null) as PageFieldValue,
      hidden: stored?.hidden ?? false,
    };
  };

  const fieldsForPage = (pageId: string, folderId: string | null): PageFieldWithValue[] => {
    const applicable = [...wikiDefs];
    const root = rootFolderId(folderId, parentById);
    if (root) applicable.push(...(folderDefsByFolder.get(root) ?? []));
    applicable.sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name));
    return applicable.map((d) => toField(d, pageId));
  };

  return pageRows.map((p) => ({
    ...p,
    projects: projsByPage.get(p.id) ?? [],
    fields: fieldsForPage(p.id, p.folderId),
  }));
}

/**
 * All custom field definitions for a user (issue #165), ordered for display.
 * Feeds the "+ Add property" picker so an existing field can be attached to a
 * page, and the field-definition editor.
 */
export async function getFieldDefinitionsForUser(
  userId: string,
): Promise<PageFieldDefinition[]> {
  const rows = await db
    .select({
      id: pageFieldDefinitions.id,
      name: pageFieldDefinitions.name,
      type: pageFieldDefinitions.type,
      scope: pageFieldDefinitions.scope,
      folderId: pageFieldDefinitions.folderId,
      options: pageFieldDefinitions.options,
      allowMultiple: pageFieldDefinitions.allowMultiple,
      orderIndex: pageFieldDefinitions.orderIndex,
    })
    .from(pageFieldDefinitions)
    .where(eq(pageFieldDefinitions.userId, userId))
    .orderBy(asc(pageFieldDefinitions.orderIndex), asc(pageFieldDefinitions.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as PageFieldType,
    scope: r.scope,
    folderId: r.folderId ?? null,
    options: r.options ?? null,
    allowMultiple: r.allowMultiple,
    orderIndex: r.orderIndex,
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
 * Pages belonging to a project: the ones linked to it directly, plus every page
 * sitting in a folder the project effectively owns (the folder's own link or
 * any ancestor's — see getFoldersByEffectiveProject).
 *
 * The folder side is resolved on every read rather than written down when the
 * link is made, so the order of events never matters: filing a page into a
 * folder that is already linked, and linking a folder that already holds pages,
 * both land the page here. The same is true for a subfolder created before or
 * after its parent was linked.
 */
export async function getPagesForProject(
  userId: string,
  projectId: string,
): Promise<PageWithProjects[]> {
  const [directRows, effectiveFolders] = await Promise.all([
    db
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
      .limit(100),
    getFoldersByEffectiveProject(userId, projectId),
  ]);

  const folderIds = effectiveFolders.map((f) => f.id);
  const folderRows = folderIds.length
    ? await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.userId, userId), inArray(pages.folderId, folderIds)))
        .orderBy(desc(pages.updatedAt))
        .limit(100)
    : [];

  const ids = [...new Set([...directRows, ...folderRows].map((r) => r.id))].slice(0, 100);
  if (ids.length === 0) return [];
  return getPagesForUser(userId, { ids });
}

/** A single Daily Page descriptor — just enough to mark a day on the calendar. */
export interface DailyPageRef {
  id: string;
  /** yyyy-MM-dd. Never null here (the query filters daily_date IS NOT NULL). */
  dailyDate: string;
  title: string;
}

/**
 * Every Daily Page for a user (daily_date IS NOT NULL), ascending by date.
 * Feeds the Wiki-home calendar's marked-day dots (Phase 30, WIKI-DAILY-01).
 * Deliberately lean — no project joins, no markdown — since the calendar only
 * needs to know which days already have a page and where to route on click.
 */
export async function getDailyPagesForUser(
  userId: string,
): Promise<DailyPageRef[]> {
  const rows = await db
    .select({
      id: pages.id,
      dailyDate: pages.dailyDate,
      title: pages.title,
    })
    .from(pages)
    .where(and(eq(pages.userId, userId), isNotNull(pages.dailyDate)))
    .orderBy(asc(pages.dailyDate));

  // daily_date is non-null by the WHERE clause; narrow the type for callers.
  return rows
    .filter((r): r is { id: string; dailyDate: string; title: string } =>
      r.dailyDate !== null,
    )
    .map((r) => ({ id: r.id, dailyDate: r.dailyDate, title: r.title }));
}
