-- 260616-g0y: claude_subscription_usage table. Claude Code Max-5x subscription
-- snapshots. Holds at most one "session" row (active 5-hour block, keyed by its
-- start time) plus a handful of "week" rows (keyed by ISO week-start). Upserted
-- by the ccusage sync pipeline; the laptop sync overwrites in place each run.
-- cost stored as integer micros. PK (user_id, kind, bucket_key) so re-syncing
-- the same block/week is an idempotent upsert.
CREATE TABLE IF NOT EXISTS "claude_subscription_usage" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"bucket_key" text NOT NULL,
	"cost_usd_micros" integer,
	"total_tokens" bigint DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_creation_tokens" bigint DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"projected_cost_usd_micros" integer,
	"projected_total_tokens" bigint,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claude_subscription_usage_pk" PRIMARY KEY ("user_id","kind","bucket_key"),
	CONSTRAINT "claude_subscription_usage_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
