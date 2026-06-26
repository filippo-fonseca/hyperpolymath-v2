-- 0044 — Daily Pages (Wiki) backup to Google Drive (issue #142).
--
-- The export engine, Drive client, and cron route already exist (Phase 28); this
-- migration adds the per-user CONTROL + TELEMETRY surface the /settings backup
-- section needs:
--   - pages_backup_enabled    : per-user opt-out for the daily cron. Defaults to
--                               true so existing users keep getting backed up.
--                               The manual "Back up now" button ignores this flag.
--   - pages_backup_last_run_at : timestamp of the last attempt (success OR fail),
--                               shown as "Last backup …" in the UI.
--   - pages_backup_last_status : short machine status of that last attempt —
--                               'ok' | 'skipped_empty' | 'not_connected' |
--                               'needs_drive_scope' | 'error'.
--   - pages_backup_last_error  : human-readable detail when the last attempt
--                               failed (null on success).
--
-- All columns live on public.users (extends the existing per-user settings row
-- rather than adding a new table — there is exactly one backup config per user).
-- RLS on public.users is unchanged: these columns are read/written only by
-- server code (the cron via the service role, the settings action via the
-- authenticated user's own row), never exposed to the client directly.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pages_backup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pages_backup_last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS pages_backup_last_status text,
  ADD COLUMN IF NOT EXISTS pages_backup_last_error text;
