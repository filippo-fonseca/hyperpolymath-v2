-- 0040 — Recurring TASKS (issue #144), DISTINCT from Habits.
--
-- Habits already model tracked behaviors on a habit-loop (days_of_week mask +
-- per-day completion logs / streaks). This is a different thing: a recurring
-- TASK is a concrete, single-instance to-do that re-spawns on a cadence with no
-- streak semantics. We model the whole series as ONE live `tasks` row carrying a
-- recurrence rule; completing or skipping the occurrence advances its due_date to
-- the next one rather than precomputing infinite future instances.
--
-- The rule lives in a nullable jsonb column. NULL = ordinary one-off task (all
-- existing rows are untouched and stay one-off). Non-null shape matches
-- RecurrenceRule in lib/tasks/recurrence.ts:
--   { "frequency": "daily" | "weekly" | "custom",
--     "interval": <int >= 1>,
--     "weekdays": [0..6]   -- weekly only, 0 = Sunday
--   }

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence jsonb;

-- Partial index over recurring rows only — the "advance the next occurrence"
-- background/cron paths and the recurring-task filters scan WHERE recurrence IS
-- NOT NULL, which stays cheap as the table grows.
CREATE INDEX IF NOT EXISTS tasks_recurrence_partial_idx
  ON public.tasks (user_id) WHERE recurrence IS NOT NULL;
