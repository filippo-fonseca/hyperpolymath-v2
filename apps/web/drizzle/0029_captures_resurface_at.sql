-- 0029 — Resurfacing (remind-me) date on captures.
--
-- Adds an optional `resurface_at timestamptz` column: the day/time at which a
-- capture should be surfaced back to the user in the /captures "Resurfacing
-- today" section. NULL = never resurface (the default for every existing row),
-- so this is additive + idempotent and leaves all current data untouched.
-- Editable from the capture detail panel and settable by JARVIS via natural
-- language ("remind me about this next Tuesday").
--
-- A partial index backs the daily resurfacing query — only rows with a set
-- resurface date are indexed, keeping the index tiny (the NULL majority is
-- skipped).
--
-- NOTE (merge): a concurrent branch may also be adding a capture column with
-- the next migration number — if so, this file may need to be renumbered on
-- rebase. The DDL itself is guarded (IF NOT EXISTS) so re-runs are safe.
ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "resurface_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captures_user_resurface_idx" ON "captures" ("user_id", "resurface_at") WHERE "resurface_at" IS NOT NULL;
