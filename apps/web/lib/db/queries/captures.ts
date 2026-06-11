import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  captures,
  capturesHashtags,
  capturesProjects,
  hashtags,
  projects,
} from "@/lib/db/schema";

export interface CaptureWithLinks {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  /**
   * D-14 / JARVIS-13 (Plan 05-02 + Plan 05-04): "jarvis" for captures created
   * by the JARVIS executor; null for manual captures from the /captures
   * composer (or any historical row before Plan 05-02 shipped migration 0010).
   * Drives the "Convert to task" affordance gating in CaptureCard +
   * CaptureDetailPanel.
   */
  createdVia: string | null;
  /** Provenance (migration 0028): device token name or 'Web'; 'voice' | 'text'. */
  sourceDevice: string | null;
  sourceInput: string | null;
  hashtags: { id: string; displayName: string; name: string }[];
  projects: { id: string; name: string }[];
}

/**
 * Smoke test for tsvector search: confirms the content_search column + GIN index work.
 * Returns top 10 ranked captures matching the query for the given user.
 * Used in Task 1a verification AND production by Task 1b's searchCaptures Server Action.
 */
export async function searchCapturesByContent(
  userId: string,
  query: string,
): Promise<{ id: string; rank: number }[]> {
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]+/gu, ""))
    .filter((t) => t.length > 0)
    .map((t) => `${t}:*`);
  if (tokens.length === 0) return [];
  const tsQuery = tokens.join(" & ");
  const rows = await db
    .select({
      id: captures.id,
      rank: sql<number>`ts_rank(${captures.contentSearch}, to_tsquery('english', ${tsQuery}))`,
    })
    .from(captures)
    .where(
      and(
        eq(captures.userId, userId),
        sql`${captures.contentSearch} @@ to_tsquery('english', ${tsQuery})`,
      ),
    )
    .orderBy(
      desc(
        sql`ts_rank(${captures.contentSearch}, to_tsquery('english', ${tsQuery}))`,
      ),
    )
    .limit(10);
  return rows;
}

/**
 * Reverse-chronological feed for /captures (CAPT-04).
 * @param hashtagId - optional filter by linked hashtag (CAPT-05 sidebar click)
 * @param ids - optional explicit ID set (search results)
 * @param limit - default 100
 */
export async function getCapturesForUser(
  userId: string,
  opts: { hashtagId?: string; ids?: string[]; limit?: number } = {},
): Promise<CaptureWithLinks[]> {
  const limit = opts.limit ?? 100;

  let captureRows: Array<{
    id: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    createdVia: string | null;
    sourceDevice: string | null;
    sourceInput: string | null;
  }>;

  if (opts.ids !== undefined) {
    if (opts.ids.length === 0) return [];
    captureRows = await db
      .select({
        id: captures.id,
        content: captures.content,
        createdAt: captures.createdAt,
        updatedAt: captures.updatedAt,
        // D-14 surface — needed for "Convert to task" affordance gating.
        createdVia: captures.createdVia,
        sourceDevice: captures.sourceDevice,
        sourceInput: captures.sourceInput,
      })
      .from(captures)
      .where(and(eq(captures.userId, userId), inArray(captures.id, opts.ids)))
      .orderBy(desc(captures.createdAt))
      .limit(limit);
  } else if (opts.hashtagId) {
    captureRows = await db
      .select({
        id: captures.id,
        content: captures.content,
        createdAt: captures.createdAt,
        updatedAt: captures.updatedAt,
        createdVia: captures.createdVia,
        sourceDevice: captures.sourceDevice,
        sourceInput: captures.sourceInput,
      })
      .from(captures)
      .innerJoin(
        capturesHashtags,
        and(
          eq(capturesHashtags.captureId, captures.id),
          eq(capturesHashtags.hashtagId, opts.hashtagId),
          eq(capturesHashtags.userId, userId),
        ),
      )
      .where(eq(captures.userId, userId))
      .orderBy(desc(captures.createdAt))
      .limit(limit);
  } else {
    captureRows = await db
      .select({
        id: captures.id,
        content: captures.content,
        createdAt: captures.createdAt,
        updatedAt: captures.updatedAt,
        createdVia: captures.createdVia,
        sourceDevice: captures.sourceDevice,
        sourceInput: captures.sourceInput,
      })
      .from(captures)
      .where(eq(captures.userId, userId))
      .orderBy(desc(captures.createdAt))
      .limit(limit);
  }

  if (captureRows.length === 0) return [];
  const captureIds = captureRows.map((c) => c.id);

  const tagLinks = await db
    .select({
      captureId: capturesHashtags.captureId,
      id: hashtags.id,
      name: hashtags.name,
      displayName: hashtags.displayName,
    })
    .from(capturesHashtags)
    .innerJoin(hashtags, eq(hashtags.id, capturesHashtags.hashtagId))
    .where(
      and(
        eq(capturesHashtags.userId, userId),
        inArray(capturesHashtags.captureId, captureIds),
      ),
    );

  const projLinks = await db
    .select({
      captureId: capturesProjects.captureId,
      id: projects.id,
      name: projects.name,
    })
    .from(capturesProjects)
    .innerJoin(projects, eq(projects.id, capturesProjects.projectId))
    .where(
      and(
        eq(capturesProjects.userId, userId),
        inArray(capturesProjects.captureId, captureIds),
      ),
    );

  const tagsByCapture = new Map<string, CaptureWithLinks["hashtags"]>();
  for (const t of tagLinks) {
    const list = tagsByCapture.get(t.captureId) ?? [];
    list.push({ id: t.id, name: t.name, displayName: t.displayName });
    tagsByCapture.set(t.captureId, list);
  }
  const projsByCapture = new Map<string, CaptureWithLinks["projects"]>();
  for (const p of projLinks) {
    const list = projsByCapture.get(p.captureId) ?? [];
    list.push({ id: p.id, name: p.name });
    projsByCapture.set(p.captureId, list);
  }

  return captureRows.map((c) => ({
    ...c,
    hashtags: tagsByCapture.get(c.id) ?? [],
    projects: projsByCapture.get(c.id) ?? [],
  }));
}

/**
 * Total captures owned by the user (no filter applied). Used to populate
 * the "All" row count at the top of the hashtag sidebar, which is the
 * primary affordance for clearing an active `?tag=` filter.
 *
 * Counts captures directly (not summed from per-hashtag counts) — that
 * approach would double-count captures with multiple hashtags AND miss
 * captures with zero hashtags.
 */
export async function getCaptureCountForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(captures)
    .where(eq(captures.userId, userId));
  return row?.value ?? 0;
}

/**
 * Captures linked to a project (CAPT-07).
 */
export async function getCapturesForProject(
  userId: string,
  projectId: string,
): Promise<CaptureWithLinks[]> {
  const rows = await db
    .select({ id: captures.id })
    .from(capturesProjects)
    .innerJoin(captures, eq(captures.id, capturesProjects.captureId))
    .where(
      and(
        eq(capturesProjects.userId, userId),
        eq(capturesProjects.projectId, projectId),
      ),
    )
    .orderBy(desc(captures.createdAt))
    .limit(100);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  return getCapturesForUser(userId, { ids });
}
