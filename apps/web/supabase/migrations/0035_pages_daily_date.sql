-- 0035 — Daily Pages (Phase 30, milestone v1.2).
--
-- Adds a nullable daily_date column to public.pages. NULL = a normal page; a
-- non-NULL calendar date (yyyy-MM-dd) marks the row as the user's Daily Page for
-- that day. A partial unique index enforces exactly one Daily Page per user per
-- day while leaving every normal page (daily_date IS NULL) unconstrained, so
-- opening a day is idempotent and race-safe (INSERT ... ON CONFLICT DO NOTHING
-- against this index can never create a duplicate).
--
-- Supersedes the old Morning Dump: this is its replacement, not a data migration.

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS daily_date date;

-- Exactly one Daily Page per (user, day). Partial so normal pages are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS pages_user_daily_date_uniq
  ON public.pages (user_id, daily_date)
  WHERE daily_date IS NOT NULL;
