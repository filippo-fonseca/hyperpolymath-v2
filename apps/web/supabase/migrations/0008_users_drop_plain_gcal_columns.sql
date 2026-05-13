-- Phase 4 Plan 04-04 cutover: drop Phase 1 placeholder columns.
-- Runs only AFTER Plans 04-01..04-03 are live + verified — encrypted columns
-- (gcal_refresh_token_encrypted, gcal_access_token_encrypted) are the sole
-- source of truth.
--
-- gcal_token_expires_at is NOT dropped (per RESEARCH §Pattern 3 footnote:
-- not sensitive, kept as plain timestamptz alongside the encrypted ciphertext).
--
-- m-07 HARD PRECONDITION (enforced in the Plan 04-04 Task 3 runbook before
-- supabase migration up is invoked):
--   psql "$DATABASE_URL" -tA -c "SELECT count(*) FROM public.users WHERE
--     gcal_refresh_token IS NOT NULL OR gcal_access_token IS NOT NULL;"
--   MUST return 0. If non-zero, halt — those users must reconnect via the
--   new encrypted OAuth flow (Plan 04-02) before this migration runs, or
--   their tokens get destroyed.
--
-- Phase 1's plain columns were intentional placeholders — no production
-- user has connected gcal via the old path. In practice the precondition
-- should never block. The gate exists so the assumption is load-bearing
-- rather than implicit.

ALTER TABLE public.users
  DROP COLUMN IF EXISTS gcal_refresh_token,
  DROP COLUMN IF EXISTS gcal_access_token;
