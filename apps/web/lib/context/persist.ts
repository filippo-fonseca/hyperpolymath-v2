/**
 * persistSnapshot — idempotent upsert into personal_context_snapshots.
 *
 * Phase 999.12 CTX-01. One snapshot per (user_id, snapshot_date). Calling this
 * twice on the same day overwrites the prior row's payload but keeps created_at
 * (the column has DEFAULT NOW() on insert; the onConflictDoUpdate set clause
 * does not touch it). That matches the contract: the cron and the manual
 * "Rebuild now" button hit the same row on the same calendar day.
 *
 * `snapshotDate` defaults to today in the user's IANA timezone when
 * `userTimezone` is supplied (e.g., `"America/New_York"`), and UTC otherwise.
 * The Vercel cron schedule `0 5 * * *` fires at 05:00 UTC regardless of user,
 * but each user's row is dated by THEIR local calendar at that moment — so a
 * 1 AM EDT firing lands on the same `snapshot_date` the user calls "today".
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
  /** Explicit YYYY-MM-DD override (mostly for tests). If unset, today is
   *  computed from `userTimezone` (or UTC if that's also unset). */
  snapshotDate?: string;
  /** IANA timezone, e.g. `"America/New_York"`. When set, the default
   *  `snapshotDate` is today in this tz instead of UTC. `null`/`undefined`
   *  fall back to UTC. */
  userTimezone?: string | null;
}

// en-CA formats Date as `YYYY-MM-DD` natively — same shape the column expects.
function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function persistSnapshot(
  userId: string,
  snapshot: ContextSnapshot,
  opts: PersistOptions = {},
): Promise<Result<{ userId: string; snapshotDate: string }>> {
  const db = opts.db ?? defaultDb;
  const snapshotDate =
    opts.snapshotDate ??
    (opts.userTimezone
      ? todayInTimezone(opts.userTimezone)
      : new Date().toISOString().slice(0, 10));

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
