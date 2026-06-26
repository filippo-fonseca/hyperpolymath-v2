/**
 * `runPagesBackupForUser(userId, opts)` — the single source of truth for "back
 * up ONE user's Pages (Wiki) to their Google Drive and record what happened".
 *
 * Issue #142. Both callers funnel through here so the gather → serialize →
 * upload → record-status pipeline lives in exactly one place:
 *   - the daily cron (`/api/cron/wiki-backup`), once per eligible user, and
 *   - the manual "Back up now" Server Action (`backupPagesNow`).
 *
 * The function NEVER throws for an expected, user-visible condition (Google not
 * connected, missing Drive scope, empty wiki, or a Drive API failure). Instead it
 * classifies the outcome into a `PagesBackupStatus`, writes that plus the
 * timestamp (and any error detail) onto the user's row, and RETURNS the result.
 * This keeps the cron loop's per-user isolation trivial (one user's failure can
 * never abort the others) and lets the settings UI render a precise status.
 *
 * Status classification:
 *   - "ok"               — a dated ZIP was written/updated in the user's Drive.
 *   - "skipped_empty"    — the user has zero pages; nothing to back up.
 *   - "not_connected"    — no stored Google refresh token (never connected /
 *                          disconnected). The user must connect Google.
 *   - "needs_drive_scope"— Google is connected but the stored token predates the
 *                          Drive scope (or the user declined it). Drive write was
 *                          rejected with an insufficient-permission error. The
 *                          user must RECONNECT Google to grant `drive.file`.
 *   - "error"            — any other failure (network, Drive 5xx, etc).
 *
 * Scope note: the existing refresh tokens issued before issue #142 / Phase 28
 * lack the `drive.file` scope. There is no way to tell that apart from a healthy
 * token without calling Drive, so we attempt the upload and map the resulting
 * insufficient-permission error to "needs_drive_scope".
 */

import { zipSync } from "fflate";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getPagesForUser } from "@/lib/db/queries/pages";
import { getFoldersForUser, getFolderProjects } from "@/lib/db/queries/folders";
import { buildPagesTree } from "@/lib/pages/tree";
import { buildTreeZip, type ExportablePage } from "@/lib/pages/markdown-export";
import { uploadWikiBackup } from "@/lib/gdrive/backup";
import {
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/errors";

export type PagesBackupStatus =
  | "ok"
  | "skipped_empty"
  | "not_connected"
  | "needs_drive_scope"
  | "error";

export interface PagesBackupResult {
  status: PagesBackupStatus;
  /** Human-readable detail when the status is "error"; null otherwise. */
  error: string | null;
  /** The Drive file name written, when status is "ok". */
  fileName?: string;
  /** The page count that was backed up, when status is "ok". */
  pageCount?: number;
}

interface RunOptions {
  /**
   * IANA timezone used to date the backup file name. When omitted the user's
   * stored `users.timezone` is loaded (falling back to UTC). The cron passes the
   * timezone it already selected so we avoid a redundant read.
   */
  timezone?: string | null;
}

/**
 * Today (YYYY-MM-DD) in the given IANA timezone. en-CA formats a Date as
 * `YYYY-MM-DD` natively. Mirrors the snapshot cron's per-user date math so a
 * 1 AM-local firing still lands on the calendar day the user calls "today".
 */
function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Detect Google's "the token is valid but lacks the Drive scope" signal. The
 * Drive API rejects a write the token isn't scoped for with HTTP 403 and a body
 * whose error reason is `insufficientPermissions` (sometimes surfaced as the
 * `ACCESS_TOKEN_SCOPE_INSUFFICIENT` status or an `insufficient_scope`
 * www-authenticate challenge). We match liberally across those shapes because
 * the surfaced GaxiosError has varied across googleapis versions.
 */
function isInsufficientScopeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;

  const status =
    typeof e.code === "number"
      ? e.code
      : typeof e.status === "number"
        ? e.status
        : undefined;

  const response = e.response as Record<string, unknown> | undefined;
  const responseStatus =
    typeof response?.status === "number"
      ? (response.status as number)
      : undefined;

  // The error payload Google returns: { error: { code, status, errors: [...] } }
  const data = response?.data as Record<string, unknown> | undefined;
  const innerError = data?.error as Record<string, unknown> | undefined;
  const innerStatus =
    typeof innerError?.status === "string"
      ? (innerError.status as string)
      : undefined;
  const reasons = Array.isArray(innerError?.errors)
    ? (innerError.errors as Array<Record<string, unknown>>)
        .map((x) => (typeof x.reason === "string" ? x.reason : ""))
        .filter(Boolean)
    : [];

  const message = typeof e.message === "string" ? e.message : "";

  const is403 = status === 403 || responseStatus === 403;
  const scopeReason =
    reasons.includes("insufficientPermissions") ||
    reasons.includes("insufficientScopes") ||
    innerStatus === "PERMISSION_DENIED" ||
    /insufficient(_| )?(permission|scope)/i.test(message) ||
    /ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message);

  return is403 && scopeReason;
}

/**
 * Persist the outcome of a backup attempt onto the user's row so /settings can
 * render "Last backup …". Always sets `pages_backup_last_run_at = now()`.
 * Best-effort: a write failure here is logged and swallowed (it must not turn a
 * successful backup into a reported failure).
 */
async function recordStatus(
  userId: string,
  status: PagesBackupStatus,
  error: string | null,
): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        pagesBackupLastRunAt: new Date(),
        pagesBackupLastStatus: status,
        pagesBackupLastError: error,
      })
      .where(eq(users.id, userId));
  } catch (writeErr) {
    console.error("[pages-backup] failed to record status", {
      userId,
      status,
      error: writeErr instanceof Error ? writeErr.message : String(writeErr),
    });
  }
}

/**
 * Back up one user's Pages to their Drive and record the result. See module doc
 * for the status contract. Never throws for an expected condition.
 */
export async function runPagesBackupForUser(
  userId: string,
  opts: RunOptions = {},
): Promise<PagesBackupResult> {
  // 1. Gather the user's wiki (pages + folder structure) in parallel.
  let pages: Awaited<ReturnType<typeof getPagesForUser>>;
  let folders: Awaited<ReturnType<typeof getFoldersForUser>>;
  let folderProjects: Awaited<ReturnType<typeof getFolderProjects>>;
  try {
    [pages, folders, folderProjects] = await Promise.all([
      getPagesForUser(userId),
      getFoldersForUser(userId),
      getFolderProjects(userId),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load pages";
    await recordStatus(userId, "error", message);
    return { status: "error", error: message };
  }

  // 2. Nothing to back up: skip the upload (no empty file) and record it.
  if (pages.length === 0) {
    await recordStatus(userId, "skipped_empty", null);
    return { status: "skipped_empty", error: null };
  }

  // 3. Serialize the wiki to a markdown ZIP (folder hierarchy preserved).
  const tree = buildPagesTree(folders, folderProjects, pages);
  const exportablePages: ExportablePage[] = pages.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
  }));
  const bytes = zipSync(buildTreeZip(tree, exportablePages));

  // 4. Resolve the file date in the user's own timezone (UTC fallback).
  let timezone = opts.timezone ?? null;
  if (timezone === undefined || timezone === null) {
    const row = await db
      .select({ tz: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    timezone = row[0]?.tz ?? null;
  }
  const date = timezone
    ? todayInTimezone(timezone)
    : new Date().toISOString().slice(0, 10);
  const fileName = `wiki-backup-${date}.zip`;

  // 5. Upload to Drive, mapping the expected Google failures to clear statuses.
  try {
    await uploadWikiBackup(userId, fileName, bytes);
  } catch (err) {
    if (
      err instanceof GcalNotConnectedError ||
      err instanceof GcalTokenRevokedError
    ) {
      await recordStatus(userId, "not_connected", null);
      return { status: "not_connected", error: null };
    }
    if (isInsufficientScopeError(err)) {
      await recordStatus(userId, "needs_drive_scope", null);
      return { status: "needs_drive_scope", error: null };
    }
    const message =
      err instanceof Error ? err.message : "Drive upload failed";
    await recordStatus(userId, "error", message);
    return { status: "error", error: message };
  }

  await recordStatus(userId, "ok", null);
  return { status: "ok", error: null, fileName, pageCount: pages.length };
}
