-- 0055 — Unlimited task deadline reminders + optional due time.
-- Mirror of drizzle/0039_task_reminders.sql (hand-applied, IF NOT EXISTS).
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_time" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "reminders" jsonb;
CREATE INDEX IF NOT EXISTS "tasks_user_reminders_idx"
  ON "tasks" ("user_id")
  WHERE "reminders" IS NOT NULL;
