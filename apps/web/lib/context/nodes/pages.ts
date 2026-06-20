/**
 * Snapshot loader: pages.
 *
 * Cap: 50 most-recent pages where no_export=false, ordered by updated_at DESC.
 * Content >2000 chars gets a plain-text summary (first 300 chars, markdown
 * syntax stripped). Full content is always included for MCP consumers.
 */

import { db as defaultDb } from "@/lib/db";
import { pagesProjects, pages as pagesTable } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
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
    nodes.push({
      type: "page" as const,
      id: r.id,
      title: r.title,
      content: r.content,
      emoji: r.emoji,
      projectIds: projectsByPage.get(r.id) ?? [],
      createdAt: dateToISO(r.createdAt),
      updatedAt: dateToISO(r.updatedAt),
      ...(summary !== undefined ? { summary } : {}),
    });
  }

  return { nodes, excluded };
}
