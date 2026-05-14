CREATE TABLE IF NOT EXISTS "jarvis_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prompt_text" text NOT NULL,
	"pre_parsed_dates" jsonb,
	"slash_command_mode" text,
	"voice_active" boolean DEFAULT false NOT NULL,
	"action_types" text[],
	"cache_read_input_tokens" integer,
	"cache_creation_input_tokens" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"first_token_ms" integer,
	"error" text
);
ALTER TABLE "jarvis_events" ADD CONSTRAINT "jarvis_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "jarvis_events_user_created_idx" ON "jarvis_events" ("user_id","created_at" DESC);
