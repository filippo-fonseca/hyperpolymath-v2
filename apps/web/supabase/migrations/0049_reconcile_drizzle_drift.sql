-- 0049 — reconcile this directory with apps/web/drizzle/.
--
-- WHY THIS FILE EXISTS
--
-- This repo carries two migration directories with independent numbering:
--
--   apps/web/drizzle/            production, applied BY HAND, idempotently
--   apps/web/supabase/migrations/  local dev, applied by `supabase start`
--
-- They drifted. Thirteen drizzle migrations were never mirrored here, so a
-- fresh `supabase start` built a database missing 12 tables and 6 columns
-- that lib/db/schema.ts (and therefore every Drizzle query) expects. The
-- symptom was a 500 on /lifeos: `column captures.source_channel does not
-- exist`. Production was fine the whole time, because production is fed from
-- drizzle/. Only local dev was broken, and only from scratch, which is why it
-- survived unnoticed: an already-running local DB had been patched by hand.
--
-- WHAT THIS DOES
--
-- Replays those thirteen drizzle migrations verbatim, in their original
-- order. Their content is copied rather than summarized on purpose: parity
-- with production means running the same DDL production ran, not a
-- reinterpretation of it. Every statement is guarded (IF NOT EXISTS, or a
-- duplicate_object EXCEPTION block), so this is safe on a database that
-- already has some or all of it.
--
-- Mirrored, in order:
--   0014_captures_to_issues     0023_routines
--   0015_kiwi_dev_runs          0024_imessage_messages
--   0019_tasks_hashtags         0025_jarvis_config
--   0020_page_custom_fields     0026_capture_favorites
--   0021_page_field_scope       0027_agentmail_email_ingest
--   0022_whatsapp_messages      0027_link_previews
--                               0031_wiki_position_keys
--
-- GOING FORWARD
--
-- A new drizzle migration must be mirrored here in the same commit, or this
-- drift returns. The drift is bidirectional today: page_folders and
-- folder_projects exist only in THIS directory and were never mirrored into
-- drizzle/, so neither directory alone is a complete description of the
-- schema. Collapsing the two into one source is the real fix; this file only
-- stops the bleeding.

-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0014_captures_to_issues.sql
-- ─────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0015_kiwi_dev_runs.sql
-- ─────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0019_tasks_hashtags.sql
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tasks_hashtags" (
	"task_id" uuid NOT NULL,
	"hashtag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "tasks_hashtags_task_id_hashtag_id_pk" PRIMARY KEY("task_id","hashtag_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_hashtags" ADD CONSTRAINT "tasks_hashtags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_hashtags" ADD CONSTRAINT "tasks_hashtags_hashtag_id_hashtags_id_fk" FOREIGN KEY ("hashtag_id") REFERENCES "public"."hashtags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_hashtags_hashtag_idx" ON "tasks_hashtags" USING btree ("hashtag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_hashtags_user_idx" ON "tasks_hashtags" USING btree ("user_id");


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0020_page_custom_fields.sql
-- ─────────────────────────────────────────────────────────────────
-- Issue #165 — Notion-style custom fields on wiki pages.
-- page_field_definitions: reusable, per-user field definitions (text/number/date/
-- select/checkbox). page_field_values: a page's value for a definition (jsonb;
-- one column holds every type). A value row existing = the field is attached to
-- that page. Applied by hand, idempotently (journal intentionally stale).
DO $$ BEGIN
 CREATE TYPE "public"."page_field_type" AS ENUM('text', 'number', 'date', 'select', 'checkbox');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "page_field_type" NOT NULL,
	"options" jsonb,
	"allow_multiple" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_field_values" (
	"page_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_field_values_page_id_field_definition_id_pk" PRIMARY KEY("page_id","field_definition_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_field_definitions" ADD CONSTRAINT "page_field_definitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_field_values" ADD CONSTRAINT "page_field_values_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_field_values" ADD CONSTRAINT "page_field_values_field_definition_id_page_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."page_field_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_field_definitions_user_idx" ON "page_field_definitions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_field_values_field_idx" ON "page_field_values" USING btree ("field_definition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_field_values_user_idx" ON "page_field_values" USING btree ("user_id");


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0021_page_field_scope.sql
-- ─────────────────────────────────────────────────────────────────
-- Issue #165 rework — wiki-wide vs folder-scoped custom fields + per-page hide.
-- page_field_definitions gains scope ('wiki' | 'folder') + folder_id (set for
-- folder-scoped defs on a top-level folder, cascading to descendant pages).
-- page_field_values gains a per-page `hidden` override. Applied by hand,
-- idempotently (journal intentionally stale).
DO $$ BEGIN
 CREATE TYPE "public"."page_field_scope" AS ENUM('wiki', 'folder');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "page_field_definitions" ADD COLUMN IF NOT EXISTS "scope" "page_field_scope" DEFAULT 'wiki' NOT NULL;--> statement-breakpoint
ALTER TABLE "page_field_definitions" ADD COLUMN IF NOT EXISTS "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "page_field_values" ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_field_definitions" ADD CONSTRAINT "page_field_definitions_folder_id_page_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."page_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_field_definitions_folder_idx" ON "page_field_definitions" USING btree ("folder_id");


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0022_whatsapp_messages.sql
-- ─────────────────────────────────────────────────────────────────
-- WhatsApp integration — messages synced from the local lharries/whatsapp-mcp
-- Go bridge into Postgres so the stateless Vercel server-side `read_whatsapp`
-- tool (and daily briefings) can query WhatsApp without a mid-turn desktop
-- round-trip. The local sync worker (`tools/whatsapp-sync/sync.mjs`) POSTs
-- new messages here via /api/whatsapp/ingest.
--
-- Applied by hand, idempotently (journal intentionally stale).
CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"chat_jid" text NOT NULL,
	"chat_name" text,
	"sender" text,
	"sender_name" text,
	"from_me" boolean DEFAULT false NOT NULL,
	"body" text,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_user_chat_external_uniq" ON "whatsapp_messages" USING btree ("user_id","chat_jid","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_messages_user_sent_at_idx" ON "whatsapp_messages" USING btree ("user_id","sent_at" DESC);


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0023_routines.sql
-- ─────────────────────────────────────────────────────────────────
-- routines — natural-language JARVIS routines. One row = a set of triggers →
-- an ordered sequence of agentic blocks. The freeform payload lives in `spec`
-- (JSONB: { version, triggers[], blocks[] }); scheduler-relevant fields are
-- denormalized into first-class columns (trigger_types, next_run_at) so the
-- time-based dispatcher can index/range-query without JSONB extraction.
--
-- Applied by hand, idempotently (journal intentionally stale).
CREATE TABLE IF NOT EXISTS "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trigger_types" text[] DEFAULT '{}' NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routines_user_updated_idx" ON "routines" USING btree ("user_id","updated_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routines_next_run_idx" ON "routines" USING btree ("enabled","next_run_at") WHERE "next_run_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routines_trigger_types_gin" ON "routines" USING gin ("trigger_types");--> statement-breakpoint
ALTER TABLE "routines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "routines_select_own" ON "routines" FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "routines_insert_own" ON "routines" FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "routines_update_own" ON "routines" FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "routines_delete_own" ON "routines" FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0024_imessage_messages.sql
-- ─────────────────────────────────────────────────────────────────
-- iMessage integration — messages synced from the local macOS Messages
-- chat.db by a small local sync worker (separate unit `imessage-sync`) that
-- POSTs new rows to /api/imessage/ingest. Mirrors whatsapp_messages so the
-- server-side `read_imessage` JARVIS tool (and daily briefings) can query
-- iMessage without a mid-turn desktop round-trip.
--
-- Applied by hand, idempotently (journal intentionally stale).
CREATE TABLE IF NOT EXISTS "imessage_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"chat_jid" text NOT NULL,
	"chat_name" text,
	"sender" text,
	"sender_name" text,
	"from_me" boolean DEFAULT false NOT NULL,
	"body" text,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "imessage_messages" ADD CONSTRAINT "imessage_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "imessage_messages_user_chat_external_uniq" ON "imessage_messages" USING btree ("user_id","chat_jid","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "imessage_messages_user_sent_at_idx" ON "imessage_messages" USING btree ("user_id","sent_at" DESC);


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0025_jarvis_config.sql
-- ─────────────────────────────────────────────────────────────────
-- jarvis_personality_config + jarvis_startup_config — one row per user each.
--
-- personality: tunes JARVIS's SPOKEN VOICE (persona preset + formality/
-- verbosity/wit dials + freeform custom instructions). The column DEFAULTS
-- (canon/formal/concise/dry, NULL custom text) reproduce today's canon voice
-- exactly, so an absent or all-default row changes nothing.
--
-- startup: mirrors the desktop startup config (apps/desktop/src/settings.ts) —
-- briefing-on-launch flag, URLs/apps to open, Shortcuts to run. Web is the
-- source of truth; the desktop reads it via the bearer-auth GET route.
--
-- Applied by hand, idempotently (journal intentionally stale).
CREATE TABLE IF NOT EXISTS "jarvis_personality_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"preset" text DEFAULT 'canon' NOT NULL,
	"formality" text DEFAULT 'formal' NOT NULL,
	"verbosity" text DEFAULT 'concise' NOT NULL,
	"wit" text DEFAULT 'dry' NOT NULL,
	"custom_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jarvis_personality_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jarvis_startup_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"briefing_enabled" boolean DEFAULT true NOT NULL,
	"open_on_start" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"startup_shortcuts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jarvis_startup_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jarvis_personality_config" ADD CONSTRAINT "jarvis_personality_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jarvis_startup_config" ADD CONSTRAINT "jarvis_startup_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jarvis_personality_config_user_idx" ON "jarvis_personality_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jarvis_startup_config_user_idx" ON "jarvis_startup_config" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "jarvis_personality_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jarvis_startup_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "jarvis_personality_config_select_own" ON "jarvis_personality_config" FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "jarvis_personality_config_insert_own" ON "jarvis_personality_config" FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "jarvis_personality_config_update_own" ON "jarvis_personality_config" FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "jarvis_personality_config_delete_own" ON "jarvis_personality_config" FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "jarvis_startup_config_select_own" ON "jarvis_startup_config" FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "jarvis_startup_config_insert_own" ON "jarvis_startup_config" FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "jarvis_startup_config_update_own" ON "jarvis_startup_config" FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "jarvis_startup_config_delete_own" ON "jarvis_startup_config" FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0026_capture_favorites.sql
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "favorite" boolean DEFAULT false NOT NULL;
CREATE INDEX IF NOT EXISTS "captures_user_favorite_created_desc_idx" ON "captures" ("user_id", "favorite", "created_at" DESC);


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0027_agentmail_email_ingest.sql
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "captures"
ADD COLUMN IF NOT EXISTS "source_channel" text;

CREATE TABLE IF NOT EXISTS "agentmail_ingest_events" (
  "event_id" text PRIMARY KEY,
  "inbox_id" text NOT NULL,
  "message_id" text NOT NULL,
  "sender" text,
  "subject" text,
  "capture_id" uuid,
  "status" text NOT NULL DEFAULT 'received',
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "agentmail_ingest_events_message_idx"
ON "agentmail_ingest_events" ("inbox_id", "message_id");

CREATE INDEX IF NOT EXISTS "agentmail_ingest_events_created_idx"
ON "agentmail_ingest_events" ("created_at" DESC);


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0027_link_previews.sql
-- ─────────────────────────────────────────────────────────────────
-- Issue #221 — rich link previews for URLs in captures.
-- link_previews: cached, per-user metadata for any URL seen in a capture. One row
-- per (user, url); fetched asynchronously and read on render instead of re-fetched.
-- provider_data (jsonb) holds media-specific extras (YouTube title/channel,
-- persisted tweet text/author). Applied by hand, idempotently (journal stale).
CREATE TABLE IF NOT EXISTS "link_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"media_type" text,
	"title" text,
	"description" text,
	"image_url" text,
	"favicon_url" text,
	"site_name" text,
	"provider_data" jsonb,
	"error" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "link_previews" ADD CONSTRAINT "link_previews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "link_previews_user_url_uniq" ON "link_previews" USING btree ("user_id","url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "link_previews_user_status_idx" ON "link_previews" USING btree ("user_id","status");


-- ─────────────────────────────────────────────────────────────────
-- from drizzle/0031_wiki_position_keys.sql
-- ─────────────────────────────────────────────────────────────────
-- 0031 — Wiki Renaissance: fractional position keys for manual ordering.
--
-- Adds a nullable `position_key text` to public.pages AND public.page_folders.
-- It holds a base-62 fractional index (see apps/web/lib/pages/position.ts) that
-- drives manual drag-to-reorder in the Explorer. Sort order is
-- (position_key NULLS LAST, name): legacy rows with NULL position_key trail the
-- manually-ordered ones and fall back to name order until the first reorder
-- lazily seeds keys for that parent's siblings. This standardizes ordering on a
-- single string key for both tables; page_folders.order_index stays untouched
-- (unused, left in place to avoid a destructive drop).
--
-- Partial indexes cover the per-parent sibling scan the reorder/seed path runs:
-- pages by (user_id, folder_id, position_key) and folders by
-- (user_id, parent_id, position_key), only for rows that already carry a key.
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS);
-- existing rows get NULL and are otherwise untouched.
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS position_key text;
--> statement-breakpoint
ALTER TABLE public.page_folders ADD COLUMN IF NOT EXISTS position_key text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pages_user_folder_position_idx
  ON public.pages (user_id, folder_id, position_key)
  WHERE position_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS page_folders_user_parent_position_idx
  ON public.page_folders (user_id, parent_id, position_key)
  WHERE position_key IS NOT NULL;


