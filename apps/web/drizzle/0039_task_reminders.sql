-- 0039 — Unlimited task deadline reminders + optional due time.
--
-- Adds:
--   - tasks.due_time  text HH:mm (24h), NULL = default 09:00 for reminder math
--   - tasks.reminders jsonb array of { id, amount, unit } offsets BEFORE due
--
-- Date-only due_date stays the scheduling day; due_time pins the wall-clock
-- moment reminders count back from. Empty/NULL reminders = no notifications.
-- Idempotent for hand-applied prod deploys (journal intentionally untouched).
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_time" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "reminders" jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_reminders_idx"
  ON "tasks" ("user_id")
  WHERE "reminders" IS NOT NULL;
