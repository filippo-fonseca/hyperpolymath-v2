"use server";

/**
 * Server Actions for the /settings "Pages backup" section (issue #142).
 *
 *   - setPagesBackupEnabled(enabled) — flip the per-user daily-cron opt-out.
 *   - backupPagesNow()               — run the SAME export the cron runs, for
 *                                      the current user, on demand. Returns a
 *                                      precise status so the UI can tell the user
 *                                      exactly what happened (backed up / nothing
 *                                      to back up / connect Google / reconnect for
 *                                      Drive permission / error).
 *
 * Auth via getClaims() only (CLAUDE.md Critical Pattern 1 — the session reader is
 * spoofable and forbidden in server code). Both actions are scoped to the
 * caller's own user id; tokens never cross the wire.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  runPagesBackupForUser,
  type PagesBackupStatus,
} from "@/lib/gdrive/run-backup";

type ToggleResult = { success: true } | { success: false; error: string };

export type BackupNowResult =
  | { success: true; status: PagesBackupStatus; message: string }
  | { success: false; error: string };

const EnabledSchema = z.boolean();

async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    return { ok: false, error: "Not authenticated" };
  }
  return { ok: true, userId: data.claims.sub };
}

/**
 * Flip the per-user daily-backup opt-out. Disabling pauses the cron for this
 * user; the manual "Back up now" button keeps working regardless.
 */
export async function setPagesBackupEnabled(
  enabled: boolean,
): Promise<ToggleResult> {
  const parsed = EnabledSchema.safeParse(enabled);
  if (!parsed.success) {
    return { success: false, error: "Invalid value" };
  }

  const auth = await requireUserId();
  if (!auth.ok) return { success: false, error: auth.error };

  await db
    .update(users)
    .set({ pagesBackupEnabled: parsed.data })
    .where(eq(users.id, auth.userId));

  revalidatePath("/settings");
  return { success: true };
}

/** User-facing message per backup status. */
const STATUS_MESSAGE: Record<PagesBackupStatus, string> = {
  ok: "Pages backed up to Google Drive.",
  skipped_empty: "Nothing to back up yet — you have no pages.",
  not_connected:
    "Connect Google in the Integrations section first, then try again.",
  needs_drive_scope:
    "Reconnect Google to grant Drive permission (your earlier connection predates it), then try again.",
  error: "Backup failed. Please try again.",
};

/**
 * Run the daily export immediately for the current user. Always returns a
 * success envelope (the work either completed or hit an expected, explained
 * condition); the inner `status` carries the precise outcome. Only an auth
 * failure returns `success: false`.
 */
export async function backupPagesNow(): Promise<BackupNowResult> {
  const auth = await requireUserId();
  if (!auth.ok) return { success: false, error: auth.error };

  const result = await runPagesBackupForUser(auth.userId);

  // The runner already wrote last-run status onto the user row; refresh the
  // settings surface so the "Last backup …" line updates.
  revalidatePath("/settings");

  return {
    success: true,
    status: result.status,
    message: STATUS_MESSAGE[result.status],
  };
}
