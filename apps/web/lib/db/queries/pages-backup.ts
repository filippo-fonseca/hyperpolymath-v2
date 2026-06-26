/**
 * Read helper for the per-user Pages-backup settings + last-run telemetry that
 * the /settings backup section renders (issue #142). Single source for the row
 * shape so the Server Component and any future surface stay in sync.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { PagesBackupStatus } from "@/lib/gdrive/run-backup";

export interface PagesBackupSettings {
  /** When false, the daily cron skips this user. Manual backup still works. */
  enabled: boolean;
  /** Last attempt timestamp (success OR failure), or null if never run. */
  lastRunAt: Date | null;
  /** Machine status of the last attempt, or null if never run. */
  lastStatus: PagesBackupStatus | null;
  /** Human-readable detail when the last attempt errored; null otherwise. */
  lastError: string | null;
}

/**
 * Load the signed-in user's backup settings + last-run status. Defaults to an
 * enabled, never-run state when the row is somehow absent (shouldn't happen for
 * an authenticated user, but keeps the UI total).
 */
export async function getPagesBackupSettings(
  userId: string,
): Promise<PagesBackupSettings> {
  const rows = await db
    .select({
      enabled: users.pagesBackupEnabled,
      lastRunAt: users.pagesBackupLastRunAt,
      lastStatus: users.pagesBackupLastStatus,
      lastError: users.pagesBackupLastError,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  return {
    enabled: row?.enabled ?? true,
    lastRunAt: row?.lastRunAt ?? null,
    lastStatus: (row?.lastStatus as PagesBackupStatus | null) ?? null,
    lastError: row?.lastError ?? null,
  };
}
