-- 260607-h2k followup: flow_sessions for Pomodoro CSV imports.
-- Unique on (user_id, started_at) so CSV re-uploads upsert in place.
CREATE TABLE IF NOT EXISTS "flow_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS "flow_sessions_user_started_uniq" ON "flow_sessions" ("user_id","started_at");
CREATE INDEX IF NOT EXISTS "flow_sessions_user_started_idx" ON "flow_sessions" ("user_id","started_at");
