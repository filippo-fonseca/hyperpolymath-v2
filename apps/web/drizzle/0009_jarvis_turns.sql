-- Drizzle-side mirror of supabase/migrations/0013_jarvis_turns.sql.
-- Kept in lockstep so `drizzle-kit` migrations against a fresh DB produce
-- the same schema as the Supabase migration path. See the Supabase file
-- for the full rationale and RLS policy notes.

CREATE TABLE IF NOT EXISTS "jarvis_turns" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "text" text,
  "text_delta" text,
  "actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "clarification" jsonb,
  "status" text,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "jarvis_turns_user_created_idx"
  ON "jarvis_turns" ("user_id", "created_at");
