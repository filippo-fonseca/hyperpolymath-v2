-- 260607-h2k followup: claude_code_usage table populated by local ccusage sync.
-- PK (user_id, date) so re-syncing the same day is an idempotent upsert.
CREATE TABLE IF NOT EXISTS "claude_code_usage" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_creation_tokens" bigint DEFAULT 0 NOT NULL,
	"total_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_usd_micros" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claude_code_usage_pk" PRIMARY KEY ("user_id","date"),
	CONSTRAINT "claude_code_usage_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
