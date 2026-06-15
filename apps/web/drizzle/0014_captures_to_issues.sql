-- 260615-h74: captures-to-issues daily cron.
-- Two additive, NULLABLE columns on captures (existing rows untouched) plus the
-- cron_runs idempotency ledger whose UNIQUE (job_name, run_date) index is the
-- once-per-day lock. Hand-written to match the project's 0010-0013 migration
-- style; the Drizzle meta snapshots are frozen at 0009, so drizzle-kit generate
-- would emit a wrong diff (it would try to recreate already-applied tables).

-- captures: additive nullable columns. github_evaluated_at is the
-- "already considered" marker; github_issue_url holds the created issue URL or
-- stays null when no issue was filed.
ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "github_issue_url" text;
ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "github_evaluated_at" timestamp with time zone;

-- cron_runs: daily idempotency ledger. UNIQUE (job_name, run_date) is the lock.
CREATE TABLE IF NOT EXISTS "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"run_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "cron_runs_job_date_uniq" ON "cron_runs" ("job_name","run_date");
