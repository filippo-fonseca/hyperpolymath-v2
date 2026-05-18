"use server";

/**
 * JARVIS Memory Server Actions.
 *
 * Phase 5.1 Plan 05.1-03 (D-M3 / JARVIS-18).
 *
 * Two write paths for jarvis_facts:
 *   - `rememberFactAction`: idempotent upsert via onConflictDoUpdate — used by
 *     the Settings → Memory edit dialog (manual fact management).
 *   - `forgetFactAction`: hard delete scoped to (id, userId) — used by:
 *       a. The Settings → Memory table's Trash button (D-M6)
 *       b. The JarvisReceipt jarvis_suggested Discard button (D-M3 / Blocker 2)
 *
 * Both actions:
 *   1. Authenticate via getClaims() — NEVER trust client-supplied userIds.
 *   2. Zod-validate input before any DB write.
 *   3. Are RLS-aware: Drizzle WHERE clause always scopes to userId for
 *      defense-in-depth (even though the DB-level RLS policy already enforces it).
 *
 * Pattern mirrors undoJarvisAction from apps/web/app/actions/jarvis.ts.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { jarvisFacts } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// rememberFactAction — idempotent upsert (for Settings → Memory edit dialog)
// ---------------------------------------------------------------------------

const RememberFactSchema = z.object({
  type: z.enum(["preference", "rule", "entity", "workflow"]),
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(500),
  source: z.enum(["user_explicit", "jarvis_suggested"]).default("user_explicit"),
});

export type RememberFactInput = z.input<typeof RememberFactSchema>;

export async function rememberFactAction(
  input: RememberFactInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims?.sub) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = claims.data.claims.sub;

  const parsed = RememberFactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    const now = new Date();
    const [row] = await db
      .insert(jarvisFacts)
      .values({
        userId,
        type: parsed.data.type,
        key: parsed.data.key,
        value: parsed.data.value,
        source: parsed.data.source,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [jarvisFacts.userId, jarvisFacts.type, jarvisFacts.key],
        set: {
          value: sql`excluded.value`,
          source: sql`excluded.source`,
          updatedAt: now,
        },
      })
      .returning({ id: jarvisFacts.id });

    return { ok: true, id: row!.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// forgetFactAction — hard delete by (factId, userId) for ownership enforcement
// ---------------------------------------------------------------------------

const ForgetFactSchema = z.object({
  factId: z.string().uuid(),
});

export type ForgetFactInput = z.input<typeof ForgetFactSchema>;

export async function forgetFactAction(
  input: ForgetFactInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims?.sub) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = claims.data.claims.sub;

  const parsed = ForgetFactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    // Always scope by (id, userId) for ownership defense-in-depth.
    // RLS policy "jarvis_facts_owner_delete" also enforces this at DB level.
    const deleted = await db
      .delete(jarvisFacts)
      .where(
        and(
          eq(jarvisFacts.id, parsed.data.factId),
          eq(jarvisFacts.userId, userId),
        ),
      )
      .returning({ id: jarvisFacts.id });

    if (deleted.length === 0) {
      return { ok: false, error: "Fact not found" };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
