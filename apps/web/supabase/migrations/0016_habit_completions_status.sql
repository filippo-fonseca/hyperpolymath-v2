-- 0016 — add status column to habit_completions.
--
-- The Drizzle schema (lib/db/schema.ts) and the analytics query
-- (lib/db/queries/analytics.ts → getAnalyticsData) both read
-- habit_completions.status, but the column was only ever added to local dev
-- ad hoc — the migration file was never written, so remote prod lacked it.
-- Result: GET /insights crashed with `column "status" does not exist`.
--
-- Tri-state per the schema comment: 'in_progress' | 'almost_done' | 'done'.
-- Row absence = not started. Default 'done' so existing rows (all of which
-- represent a completed check-off) backfill correctly. Idempotent.

ALTER TABLE public.habit_completions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habit_completions_status_check'
  ) THEN
    ALTER TABLE public.habit_completions
      ADD CONSTRAINT habit_completions_status_check
      CHECK (status IN ('in_progress', 'almost_done', 'done'));
  END IF;
END $$;
