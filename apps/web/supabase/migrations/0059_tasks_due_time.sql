-- 0042 — optional time-of-day on task due dates.
--
-- Tasks were day-granular only. due_time is a nullable Postgres `time`
-- alongside due_date: NULL = the task is due "sometime that day" (existing
-- behavior, unchanged). Clients read/write it as "HH:MM" 24h; mobile uses it
-- to schedule local notifications at the precise minute. A time without a
-- date is meaningless, so writers clear due_time whenever due_date clears.
-- Idempotent.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_time time;
