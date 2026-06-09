/**
 * persistSnapshot — idempotent upsert into personal_context_snapshots.
 *
 * Phase 999.12 CTX-01. One snapshot per (user_id, snapshot_date). Calling this
 * twice on the same day overwrites the prior row's payload but keeps created_at
 * (the column has DEFAULT NOW() on insert; the onConflictDoUpdate set clause
 * does not touch it). That matches the contract: the cron and the manual
 * "Rebuild now" button hit the same row on the same calendar day.
 *
 * `snapshotDate` defaults to today (UTC), matching the Vercel cron schedule
 * `0 5 * * *` (00:00 ET / 05:00 UTC) which lands on the new UTC date.
 *
 * The payload column in `apps/web/lib/db/schema.ts` is typed as plain `jsonb`
 * (no `.$type<ContextSnapshot>()`) to avoid a `schema.ts → build-snapshot.ts
 * → schema.ts` circular import. We cast at this query site instead.
 */

import { db as defaultDb } from "@/lib/db";
import { personalContextSnapshots } from "@/lib/db/schema";
import { type Result, ok, err } from "@/lib/integrations/result";
import { type ContextSnapshot, CURRENT_SCHEMA_VERSION } from "./types";

export type DB = typeof defaultDb;

export interface PersistOptions {
  db?: DB;
  /** YYYY-MM-DD; defaults to today (UTC). */
  snapshotDate?: string;
}

export async function persistSnapshot(
  userId: string,
  snapshot: ContextSnapshot,
  opts: PersistOptions = {},
): Promise<Result<{ userId: string; snapshotDate: string }>> {
  const db = opts.db ?? defaultDb;
  const snapshotDate =
    opts.snapshotDate ?? new Date().toISOString().slice(0, 10);

  try {
    await db
      .insert(personalContextSnapshots)
      .values({
        userId,
        snapshotDate,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        // Cast at the call site (the column is plain `jsonb` in schema.ts to
        // avoid a circular import with this module's type chain).
        payload: snapshot as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [
          personalContextSnapshots.userId,
          personalContextSnapshots.snapshotDate,
        ],
        set: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          payload: snapshot as unknown as Record<string, unknown>,
        },
      });
    return ok({ userId, snapshotDate });
  } catch (e) {
    return err(e instanceof Error ? e.message : "persistSnapshot failed");
  }
}
