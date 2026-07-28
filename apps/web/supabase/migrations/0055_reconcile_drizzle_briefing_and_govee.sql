-- 0055 — reconcile this directory with apps/web/drizzle/, round two.
--
-- WHY THIS FILE EXISTS
--
-- Same failure mode 0049 was written to end, recurred. Three drizzle
-- migrations landed in apps/web/drizzle/ (production) and were never mirrored
-- here (local dev), so a fresh `supabase start` builds a database that
-- lib/db/schema.ts describes but does not contain:
--
--   drizzle/0031_briefing.sql            -> briefing_editions, briefing_items
--   drizzle/0037_briefing_default_off.sql-> jarvis_startup_config.briefing_enabled
--                                            default flipped to false
--   drizzle/0038_user_govee_devices.sql  -> user_govee_devices
--
-- Measured with `node scripts/schema-drift-report.mjs` against a local stack:
-- schema.ts declares 59 tables, a fresh local build had 56 of them, and the
-- live long-running local DB had 57 (someone had hand-created
-- user_govee_devices and the patch would have died at the next `supabase
-- stop`). briefing_editions and briefing_items were missing outright, so
-- /briefing 500s on any clean local environment.
--
-- Production was never affected: production is fed from drizzle/.
--
-- WHAT THIS DOES
--
-- Replays those three drizzle migrations verbatim, in their original order,
-- for the reason 0049 gives: parity with production means running the DDL
-- production ran, not a reinterpretation of it. Every statement is guarded
-- (IF NOT EXISTS, or a duplicate_object EXCEPTION block), so this is safe on a
-- database that already has some or all of it.
--
-- The trailing GRANT is belt-and-braces. 0051 sets ALTER DEFAULT PRIVILEGES so
-- tables created after it are granted automatically, and on a fresh reset 0051
-- runs before this file. On a DB where these tables were created by hand
-- before 0051's defaults existed, they would have no grants, and the explicit
-- GRANT below fixes that.

-- ---------------------------------------------------------------------------
-- drizzle/0031_briefing.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "briefing_editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"edition_date" date NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"raw_source_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "briefing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"section" text DEFAULT 'general' NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"url" text,
	"source_name" text DEFAULT '' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "briefing_editions" ADD CONSTRAINT "briefing_editions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "briefing_items" ADD CONSTRAINT "briefing_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "briefing_items" ADD CONSTRAINT "briefing_items_edition_id_briefing_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."briefing_editions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "briefing_editions_user_date_key" ON "briefing_editions" USING btree ("user_id","edition_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_editions_user_generated_idx" ON "briefing_editions" USING btree ("user_id","generated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_items_edition_idx" ON "briefing_items" USING btree ("edition_id","section","order_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_items_user_idx" ON "briefing_items" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "briefing_editions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "briefing_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "briefing_editions_select_own" ON "briefing_editions" FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "briefing_items_select_own" ON "briefing_items" FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- drizzle/0037_briefing_default_off.sql
--
-- The proactive spoken briefing fired on every desktop wake because the flag
-- defaulted ON. It is opt-in now. The UPDATE is guarded by
-- `WHERE briefing_enabled = true`, so a second run matches zero rows.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "jarvis_startup_config" ALTER COLUMN "briefing_enabled" SET DEFAULT false;
--> statement-breakpoint
UPDATE "jarvis_startup_config" SET "briefing_enabled" = false, "updated_at" = now() WHERE "briefing_enabled" = true;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- drizzle/0038_user_govee_devices.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user_govee_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"capabilities_cache" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_govee_devices_user_device_uniq" UNIQUE("user_id","device_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_govee_devices" ADD CONSTRAINT "user_govee_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_govee_devices_user_idx" ON "user_govee_devices" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "user_govee_devices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "user_govee_devices_select_own" ON "user_govee_devices" FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "user_govee_devices_insert_own" ON "user_govee_devices" FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "user_govee_devices_update_own" ON "user_govee_devices" FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "user_govee_devices_delete_own" ON "user_govee_devices" FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Grants, per 0051. Safe on a DB where the default privileges already covered
-- these tables; required on one where they were hand-created earlier.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "briefing_editions", "briefing_items", "user_govee_devices" TO anon, authenticated, service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
