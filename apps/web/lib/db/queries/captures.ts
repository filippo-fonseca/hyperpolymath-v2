import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { captures } from "@/lib/db/schema";

/**
 * Smoke test for tsvector search: confirms the content_search column + GIN index work.
 * Returns top 10 ranked captures matching the query for the given user.
 * Used in Task 1a verification AND production by Task 1b's searchCaptures Server Action.
 *
 * Note: Task 1b extends this file with getCapturesForUser + getCapturesForProject helpers
 * (and the CaptureWithLinks interface) — keeping Task 1a's commit scoped to migration-only.
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
