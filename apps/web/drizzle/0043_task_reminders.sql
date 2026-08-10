-- 0043 — per-task reminder offsets for due notifications.
--
-- reminder_offsets_min holds the "minutes before the due moment" offsets the
-- user picked from the fixed preset ladder (10, 60, 120, 180, 720, 1440,
-- 4320, 10080). Empty array = no reminders (the default). Reminders are only
-- meaningful with a due_date, so writers clear the array whenever the date
-- clears, mirroring due_time. Delivery is device-local (mobile schedules OS
-- notifications at due-minus-offset; web arms tab-local timers), so there is
-- no server-side sent log. Idempotent.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reminder_offsets_min integer[] NOT NULL DEFAULT '{}';
