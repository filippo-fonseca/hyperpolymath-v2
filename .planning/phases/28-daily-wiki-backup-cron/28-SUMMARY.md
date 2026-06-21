# Phase 28 — Daily Wiki Backup CRON to Google Drive — SUMMARY

Status: SHIPPED on `fix/pages-create-ux`. Typecheck clean (except the 6 known
pre-existing `tests/api-jarvis-tts.test.ts` NextRequest errors); `pnpm --filter
web build` green with `/api/cron/wiki-backup` compiled. No DB or migration
changes. Not pushed.

## What shipped
A daily Vercel cron that backs up every user's entire Wiki to their Google Drive
as a dated markdown ZIP, resilient to per-user failures. Built entirely on
existing infrastructure: the Phase 27 export builders for the payload and the
Phase 4 Google OAuth stack for auth.

1. `apps/web/app/api/cron/wiki-backup/route.ts` — Node-runtime GET handler.
   - CRON_SECRET bearer guard copied verbatim from snapshot-context (missing
     secret -> 500, wrong/absent bearer -> 401).
   - Loops every `users` row; one user's failure is caught, logged
     (`console.error("[cron wiki-backup] ...")`), pushed to a `failures[]` array,
     and skipped, never aborting the others.
   - Per user: loads pages/folders/folderProjects via the query layer, builds the
     tree (`buildPagesTree`), zips it (`buildTreeZip` + fflate `zipSync`) using
     ONLY the pure Phase 27 builders (no browser download helpers), then uploads.
   - File name `wiki-backup-YYYY-MM-DD.zip`, dated in the user's IANA timezone
     (en-CA `Intl.DateTimeFormat`, matching how persist.ts derives
     `snapshot_date`); null timezone falls back to UTC.
   - Zero-page users are skipped (no empty backup), counted as `skipped`.
   - Returns `{ ok, backups_written, skipped, failures }`.

2. `apps/web/lib/gdrive/drive.ts` — `getValidDriveClient(userId)` =
   `google.drive({version:"v3", auth})` over the shared OAuth client.

3. `apps/web/lib/gdrive/backup.ts` — `uploadWikiBackup(userId, fileName, bytes)`:
   find-or-create the "Hyperpolymath Wiki Backups" folder, then find-or-update the
   dated file inside it (same-day re-runs overwrite in place, no duplicates).
   Drive query values are escaped (injection-safe). Media is a single-use
   `Readable.from(Buffer.from(bytes))`, mimeType `application/zip`.

4. `apps/web/lib/gcal/token.ts` — extracted
   `getAuthenticatedGoogleOAuthClient(userId)` as the shared core (load tokens,
   refresh on expiry, persist via the `tokens` event, clear-on-invalid_grant).
   `getValidGcalToken` now just wraps it in `google.calendar(...)`, so the
   Calendar path is behaviorally unchanged.

5. `apps/web/app/api/gcal/auth/route.ts` — added
   `https://www.googleapis.com/auth/drive.file` to the OAuth scopes.

6. `apps/web/vercel.json` — registered the cron at `0 6 * * *` (one hour after the
   05:00 snapshot cron so they never contend).

## Operational caveat (not a bug)
Existing Google refresh tokens predate the `drive.file` scope, so the user must
reconnect Google ONCE via `/api/gcal/auth` before Drive uploads succeed. Until
then `uploadWikiBackup` fails per-user gracefully (logged, no crash).

## Commits (this phase)
- `a2fefa4` feat(wiki): extract shared Google OAuth client helper + Drive client
- `9ff066c` feat(wiki): Drive wiki-backup upload module (find-or-create folder, find-or-update file)
- `3e08458` feat(wiki): daily wiki-backup cron route
- `da00276` feat(wiki): add drive.file OAuth scope
- `347bfc8` chore(wiki): register wiki-backup cron in vercel.json
