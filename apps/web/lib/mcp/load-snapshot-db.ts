/**
 * DB-backed loader callbacks for the MCP server.
 *
 * Phase 999.12 MCP-02. The personal-context-mcp workspace package is
 * deliberately decoupled from apps/web's database — it accepts LoadSnapshot
 * and LoadHistory callbacks that the route handler (Plan 04) wires in.
 *
 * Both loaders:
 *   - Read from personal_context_snapshots (composite PK user_id + snapshot_date)
 *   - Route every read through `migrate()` so a future schema bump doesn't
 *     break clients reading older payloads (CTX-09 forever-snapshot rule)
 *   - Are scoped to a single userId — there is no "list all users" path
 *     and the route handler resolves userId from the bearer token before
 *     calling these
 */

import { desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { personalContextSnapshots } from "@/lib/db/schema";
import { migrate } from "@/lib/context/migrate";
import type {
  LoadSnapshot,
  LoadHistory,
  ContextSnapshot,
  SnapshotHistoryEntry,
} from "@hyperpolymath/personal-context-mcp";

type DB = typeof defaultDb;

/**
 * Build a LoadSnapshot closure that reads the latest snapshot for a given
 * userId, runs it through the migrator, and returns the typed payload.
 *
 * If the most recent row is a pre-v1 payload with no registered migrator,
 * `migrate()` returns a `_legacy: true` wrapper — we treat that as "no
 * usable snapshot" rather than send a half-typed payload to MCP clients.
 */
export function makeLoadSnapshot(db: DB = defaultDb): LoadSnapshot {
  return async (userId: string): Promise<ContextSnapshot | null> => {
    const rows = await db
      .select({
        payload: personalContextSnapshots.payload,
        schemaVersion: personalContextSnapshots.schemaVersion,
      })
      .from(personalContextSnapshots)
      .where(eq(personalContextSnapshots.userId, userId))
      .orderBy(desc(personalContextSnapshots.snapshotDate))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const migrated = migrate(row.payload, row.schemaVersion);
    if (!migrated.ok) return null;
    if ("_legacy" in migrated.data) return null;

    return migrated.data;
  };
}

/**
 * Build a LoadHistory closure that returns metadata-only entries for the
 * user's last N snapshots (capped to 30 at the tool-handler layer).
 *
 * Crucially excludes `nodes` and `edges` — those can be 100s of KB each, and
 * the entire point of get_snapshot_history vs. get_current_context is the
 * smaller per-row payload. We pull `payload` only to extract meta.
 */
export function makeLoadHistory(db: DB = defaultDb): LoadHistory {
  return async (userId: string, days: number): Promise<SnapshotHistoryEntry[]> => {
    const rows = await db
      .select({
        snapshotDate: personalContextSnapshots.snapshotDate,
        schemaVersion: personalContextSnapshots.schemaVersion,
        payload: personalContextSnapshots.payload,
      })
      .from(personalContextSnapshots)
      .where(eq(personalContextSnapshots.userId, userId))
      .orderBy(desc(personalContextSnapshots.snapshotDate))
      .limit(days);

    return rows.map((r) => {
      const p = r.payload as {
        meta?: {
          totalNodes?: number;
          totalEdges?: number;
          nodeCounts?: Record<string, number>;
        };
      } | null;
      return {
        snapshotDate: String(r.snapshotDate),
        schemaVersion: r.schemaVersion,
        nodeCounts: p?.meta?.nodeCounts ?? {},
        totalNodes: p?.meta?.totalNodes ?? 0,
        totalEdges: p?.meta?.totalEdges ?? 0,
      };
    });
  };
}
