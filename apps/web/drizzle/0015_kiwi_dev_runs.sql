-- 260615-lkl: kiwi_dev_runs daily auto-dev summary.
-- One additive table plus the UNIQUE (user_id, run_date) index that turns the
-- daily ingest POST into an upsert (one row per owner per day). Hand-written to
-- match the project's 0010-0014 migration style; the Drizzle meta snapshots are
-- frozen at 0009, so drizzle-kit generate would emit a wrong diff (it would try
-- to recreate already-applied tables).

-- kiwi_dev_runs: daily summary of the local Kiwi auto-dev worker. The owner-only
-- DEVELOPMENT tab on /insights reads these newest-first. items holds the per-issue
-- breakdown as jsonb.
CREATE TABLE IF NOT EXISTS "kiwi_dev_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"status" text,
	"issues_attempted" integer DEFAULT 0 NOT NULL,
	"issues_done" integer DEFAULT 0 NOT NULL,
	"issues_skipped" integer DEFAULT 0 NOT NULL,
	"issues_failed" integer DEFAULT 0 NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- One row per owner per day; this UNIQUE index is the upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS "kiwi_dev_runs_user_date_uniq" ON "kiwi_dev_runs" ("user_id","run_date");
