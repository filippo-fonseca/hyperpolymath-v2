-- Phase 7 polish — persisted JARVIS scrollback.
--
-- See lib/db/schema.ts:jarvisTurns for column semantics. Stored as a flat
-- projection of the client-side ScrollbackTurn union; reconstructed on read.
--
-- The LLM context window still uses an in-memory sliding window of the last
-- N turns (JarvisConsole.buildHistory). This table is for UI hydration only —
-- so the scrollback survives page reloads.
--
-- This migration is trimmed to ONLY the new table. drizzle-kit picked up
-- other tables (jarvis_events, jarvis_facts, captures.created_via) that
-- live in Supabase via earlier manual migrations not tracked by the drizzle
-- journal — they would have been re-created as no-ops via IF NOT EXISTS but
-- the migration is cleaner without them.

CREATE TABLE IF NOT EXISTS "jarvis_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"text_delta" text,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clarification" jsonb,
	"status" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jarvis_turns" ADD CONSTRAINT "jarvis_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jarvis_turns_user_created_idx" ON "jarvis_turns" USING btree ("user_id","created_at");
--> statement-breakpoint

-- RLS: owner-only SELECT + INSERT + UPDATE. UPDATE is required because the
-- client upserts an assistant turn on stream completion AND on undo (the
-- same id is re-saved with a different actions[] state). DELETE intentionally
-- omitted — the scrollback is append/amend-only.
ALTER TABLE "jarvis_turns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "jarvis_turns_select_own" ON "jarvis_turns"
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "jarvis_turns_insert_own" ON "jarvis_turns"
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "jarvis_turns_update_own" ON "jarvis_turns"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
