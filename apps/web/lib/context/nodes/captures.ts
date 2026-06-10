/**
 * Snapshot loader: captures.
 *
 * Cap: 50 most-recent captures where no_export=false. Capture text can be long;
 * truncate to 500 chars per RESEARCH.md Pitfall 2 (snapshot payload bloat).
 *
 * Two side-reads pulled in one go via owner-scoped junctions:
 *   - captures_projects: composite PK (captureId, projectId), denormalized user_id
 *   - captures_hashtags + hashtags: tag display strings for capture_tagged edges
 */

import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import {
  captures as capturesTable,
  capturesProjects,
  capturesHashtags,
  hashtags as hashtagsTable,
} from "@/lib/db/schema";
import type { Node } from "../types";

export type DB = typeof defaultDb;

const CAPTURES_CAP = 50;
const CAPTURES_QUERY_WINDOW = 75; // small overshoot so excluded count tracks the recency window
const CAPTURE_TEXT_MAX = 500;

function dateToISO(d: Date | string | null): string {
  if (d === null) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

export async function loadCaptures(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: capturesTable.id,
      content: capturesTable.content,
      createdAt: capturesTable.createdAt,
      noExport: capturesTable.noExport,
    })
    .from(capturesTable)
    .where(eq(capturesTable.userId, userId))
    .orderBy(desc(capturesTable.createdAt))
    .limit(CAPTURES_QUERY_WINDOW);

  const projectLinks = await db
    .select({
      captureId: capturesProjects.captureId,
      projectId: capturesProjects.projectId,
    })
    .from(capturesProjects)
    .where(eq(capturesProjects.userId, userId));

  const tagLinks = await db
    .select({
      captureId: capturesHashtags.captureId,
      displayName: hashtagsTable.displayName,
    })
    .from(capturesHashtags)
    .innerJoin(hashtagsTable, eq(hashtagsTable.id, capturesHashtags.hashtagId))
    .where(and(eq(capturesHashtags.userId, userId), eq(hashtagsTable.userId, userId)));

  const projectsByCapture = new Map<string, string[]>();
  for (const link of projectLinks) {
    const arr = projectsByCapture.get(link.captureId) ?? [];
    arr.push(link.projectId);
    projectsByCapture.set(link.captureId, arr);
  }

  const tagsByCapture = new Map<string, string[]>();
  for (const link of tagLinks) {
    const arr = tagsByCapture.get(link.captureId) ?? [];
    arr.push(link.displayName);
    tagsByCapture.set(link.captureId, arr);
  }

  let excluded = 0;
  const nodes: Node[] = [];
  for (const r of rows) {
    if (r.noExport) {
      excluded++;
      continue;
    }
    if (nodes.length >= CAPTURES_CAP) continue;
    nodes.push({
      type: "capture" as const,
      id: r.id,
      text: r.content.slice(0, CAPTURE_TEXT_MAX),
      createdAt: dateToISO(r.createdAt),
      tags: tagsByCapture.get(r.id) ?? [],
      projectIds: projectsByCapture.get(r.id) ?? [],
    });
  }

  return { nodes, excluded };
}
