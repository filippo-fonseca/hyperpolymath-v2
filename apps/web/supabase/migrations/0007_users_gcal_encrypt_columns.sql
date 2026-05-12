-- Phase 4 Plan 04-01: additive — adds encrypted token columns + multi-calendar prefs + IANA timezone.
-- Phase 1 plain gcal_* columns are NOT touched here; they are dropped in 0008 (Plan 04-04) after cutover.
-- No data backfill: Phase 1 columns are intentional placeholders, no production user has connected gcal yet.
--
-- Encryption scheme (D-05 revised): app-level AES-256-GCM via node:crypto. Key lives in env var
-- GCAL_TOKEN_ENC_KEY (32 bytes, base64-encoded). Encryption stays in the application layer —
-- the key never crosses the DB wire. Bytea layout: `iv (12B) || tag (16B) || ciphertext`.
--
-- New columns:
--   gcal_refresh_token_encrypted  bytea     — AES-256-GCM ciphertext of OAuth refresh_token
--   gcal_access_token_encrypted   bytea     — AES-256-GCM ciphertext of OAuth access_token (optional cache)
--   gcal_default_calendar_id      text      — D-09: which calendar Kiwi posts to by default
--   gcal_visible_calendar_ids     text[]    — D-10: multi-calendar visibility set (null = show all)
--   timezone                      text      — D-08: IANA tz, e.g. "America/New_York"
--
-- gcal_token_expires_at (Phase 1) stays as plain timestamptz — not sensitive, no re-encryption needed.

ALTER TABLE public.users
  ADD COLUMN gcal_refresh_token_encrypted bytea,
  ADD COLUMN gcal_access_token_encrypted bytea,
  ADD COLUMN gcal_default_calendar_id text,
  ADD COLUMN gcal_visible_calendar_ids text[],
  ADD COLUMN timezone text;
