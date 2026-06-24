/**
 * `uploadWikiBackup(userId, fileName, zipBytes)` — push one user's Wiki backup
 * ZIP to their Google Drive, idempotently per file name.
 *
 * Phase 28 (daily Wiki backup cron). The flow is find-or-create the backup
 * FOLDER, then find-or-update the dated FILE inside it:
 *   1. Get the authenticated Drive client (shared OAuth helper).
 *   2. find-or-create a folder named "Hyperpolymath Wiki Backups" (reuse the
 *      first non-trashed match; create it only when absent).
 *   3. find-or-update the dated zip in that folder: if a non-trashed file with
 *      the exact name already exists (same-day re-run), UPDATE its media so we
 *      never accumulate duplicates; otherwise CREATE it.
 *
 * The whole find-or-create-folder + find-or-update-file sequence runs to
 * completion before returning, so a same-day re-run replaces the prior backup
 * cleanly rather than leaving a partial or duplicate file. Errors are allowed
 * to throw — the cron loop catches them per-user so one user's Drive failure
 * never aborts the others.
 */

import { Readable } from "node:stream";
import type { drive_v3 } from "googleapis";
import { getValidDriveClient } from "./drive";

const BACKUP_FOLDER_NAME = "Hyperpolymath Wiki Backups";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ZIP_MIME = "application/zip";

/**
 * Escape a value for use inside a Drive query `name = '...'` clause. Drive's
 * query language uses single-quoted string literals where a literal single
 * quote and backslash must be backslash-escaped. Our file/folder names are
 * controlled (a fixed folder name and a `wiki-backup-YYYY-MM-DD.zip` pattern),
 * but escaping keeps the query correct and injection-safe regardless.
 */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Find the backup folder by name, or create it. Returns the folder id. */
async function findOrCreateBackupFolder(
  drive: drive_v3.Drive,
): Promise<string> {
  const q = `name = '${escapeQueryValue(
    BACKUP_FOLDER_NAME,
  )}' and mimeType = '${FOLDER_MIME}' and trashed = false`;

  const existing = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 1,
  });

  const found = existing.data.files?.[0];
  if (found?.id) return found.id;

  const created = await drive.files.create({
    requestBody: { name: BACKUP_FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: "id",
  });

  const folderId = created.data.id;
  if (!folderId) {
    throw new Error("Drive folder create returned no id");
  }
  return folderId;
}

/**
 * Upload `zipBytes` as `fileName` into the user's Wiki backup folder. Updates an
 * existing same-named, non-trashed file in that folder if one is present (so a
 * same-day re-run overwrites), else creates it. Returns the file id.
 */
export async function uploadWikiBackup(
  userId: string,
  fileName: string,
  zipBytes: Uint8Array,
): Promise<{ fileId: string }> {
  const drive = await getValidDriveClient(userId);
  const folderId = await findOrCreateBackupFolder(drive);

  const q = `name = '${escapeQueryValue(
    fileName,
  )}' and '${folderId}' in parents and trashed = false`;

  const existing = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 1,
  });

  // A fresh Readable is built per request (it is single-use).
  const media = {
    mimeType: ZIP_MIME,
    body: Readable.from(Buffer.from(zipBytes)),
  };

  const found = existing.data.files?.[0];
  if (found?.id) {
    const updated = await drive.files.update({
      fileId: found.id,
      media,
      fields: "id",
    });
    const fileId = updated.data.id ?? found.id;
    return { fileId };
  }

  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media,
    fields: "id",
  });

  const fileId = created.data.id;
  if (!fileId) {
    throw new Error("Drive file create returned no id");
  }
  return { fileId };
}
