/**
 * DB query helpers for jarvis_facts.
 *
 * Phase 5.1 (D-M1 / D-M4 / JARVIS-18) — reads facts for whole-blob injection
 * into the cached system prompt per buildSystemPrompt/buildFactsBlock.
 *
 * RLS enforced at the DB level (migration 0011). These helpers are used
 * server-side (Route Handler + Settings page); RLS holds via the postgres-js
 * driver connecting with the service_role key that bypasses RLS — BUT
 * we always scope every query with WHERE user_id = $userId so cross-tenant
 * leakage is impossible at the query level as well.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jarvisFacts } from "@/lib/db/schema";

export type JarvisFactRow = {
  id: string;
  type: "preference" | "rule" | "entity" | "workflow";
  key: string;
  value: string;
  source: "user_explicit" | "jarvis_suggested";
  updatedAt: Date;
  lastUsedAt: Date | null;
};

/**
 * Load all facts for a user ordered by updatedAt DESC.
 *
 * Returns the compact shape suitable for:
 *   - Prompt injection via buildFactsBlock (type/key/value only)
 *   - Settings → Memory page display (all fields including id/source for edit + delete)
 */
export async function getJarvisFactsForUser(userId: string): Promise<JarvisFactRow[]> {
  const rows = await db
    .select({
      id: jarvisFacts.id,
      type: jarvisFacts.type,
      key: jarvisFacts.key,
      value: jarvisFacts.value,
      source: jarvisFacts.source,
      updatedAt: jarvisFacts.updatedAt,
      lastUsedAt: jarvisFacts.lastUsedAt,
    })
    .from(jarvisFacts)
    .where(eq(jarvisFacts.userId, userId))
    .orderBy(desc(jarvisFacts.updatedAt));
  // Cast: Drizzle infers text columns as `string`; the DB CHECK constraint
  // guarantees the literal union values at write time (migration 0011).
  return rows as JarvisFactRow[];
}
