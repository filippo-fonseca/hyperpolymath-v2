-- jarvis_startup_config.briefing_enabled — flip the default OFF (opt-in).
--
-- The proactive spoken briefing ("Good morning, sir" + overview) fired on every
-- desktop wake regardless of what the user said, because the briefing flag
-- defaulted ON. It now defaults OFF: the briefing only runs when the user
-- explicitly enables it in the StartupEditor. The load-bearing default also
-- lives in code (DEFAULT_STARTUP_CONFIG in @hyperpolymath/jarvis-core, returned
-- by the GET route when the user has no row) and is flipped there too.
--
-- This migration (1) changes the column default for future rows and (2) turns
-- OFF any existing row: there is no per-row "user explicitly set this" flag to
-- distinguish an intentional opt-in from the old auto-ON default, and the user
-- wants the unsolicited briefing gone, so all current rows are set to false.
--
-- Idempotent / re-run safe: SET DEFAULT is deterministic; the UPDATE is guarded
-- by `WHERE briefing_enabled = true`, so a second run matches zero rows.
--
-- Applied by hand, idempotently (journal intentionally stale).
ALTER TABLE IF EXISTS "jarvis_startup_config" ALTER COLUMN "briefing_enabled" SET DEFAULT false;--> statement-breakpoint
UPDATE "jarvis_startup_config" SET "briefing_enabled" = false, "updated_at" = now() WHERE "briefing_enabled" = true;
