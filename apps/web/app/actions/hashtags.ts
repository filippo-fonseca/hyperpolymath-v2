"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { hashtags, capturesHashtags } from "@/lib/db/schema";

/**
 * Subset of the drizzle DB surface that both the top-level `db` AND a transaction
 * handle (`tx`) expose. Pick<typeof db, "insert"> is too narrow for transactions; use
 * Parameters<typeof db.transaction>[0]'s first argument type via a helper alias.
 *
 * Warning 10 fix: callers inside `db.transaction(async (tx) => …)` can pass `tx`
 * so the hashtag upsert participates in the surrounding transaction.
 */
type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

/**
 * CAPT-08 + Pitfall 9 (race-safe): atomic upsert.
 * - `name` lowercase canonical for unique key
 * - `displayName` is the first-seen casing — only set on INSERT, preserved on conflict
 * - Warning 10 fix: accepts optional `txOrDb` so a caller inside a transaction can pass
 *   the same `tx`. This makes hashtag upsert + capture_hashtag insert atomic together —
 *   if the junction insert fails, the hashtag insert rolls back too.
 */
export async function upsertHashtag(
  userId: string,
  rawName: string,
  txOrDb: DbOrTx = db,
): Promise<{ id: string; name: string; displayName: string }> {
  const trimmed = rawName.replace(/^#/, "").trim();
  if (!trimmed) throw new Error("Hashtag cannot be empty");
  const name = trimmed.toLowerCase();
  const displayName = trimmed;

  const [row] = await txOrDb
    .insert(hashtags)
    .values({ userId, name, displayName })
    .onConflictDoUpdate({
      target: [hashtags.userId, hashtags.name],
      // Preserve existing displayName on conflict — first-seen casing wins (CAPT-08).
      // Use a no-op SET that still triggers RETURNING for the row.
      set: { name: sql`EXCLUDED.name` },
    })
    .returning({
      id: hashtags.id,
      name: hashtags.name,
      displayName: hashtags.displayName,
    });
  return row;
}

/**
 * For sidebar: returns all hashtags for user with capture count, sorted DESC by count.
 * CAPT-05: sidebar lists hashtags with counts.
 */
export async function getHashtagsForUser(): Promise<
  ActionResult<
    { id: string; name: string; displayName: string; count: number }[]
  >
> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const rows = await db
    .select({
      id: hashtags.id,
      name: hashtags.name,
      displayName: hashtags.displayName,
      count: sql<number>`COUNT(${capturesHashtags.captureId})::int`,
    })
    .from(hashtags)
    .leftJoin(
      capturesHashtags,
      and(
        eq(capturesHashtags.hashtagId, hashtags.id),
        eq(capturesHashtags.userId, userId),
      ),
    )
    .where(eq(hashtags.userId, userId))
    .groupBy(hashtags.id, hashtags.name, hashtags.displayName)
    .orderBy(desc(sql`COUNT(${capturesHashtags.captureId})`));

  return { success: true, data: rows };
}
