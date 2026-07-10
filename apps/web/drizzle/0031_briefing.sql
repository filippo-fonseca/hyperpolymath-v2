-- briefing — the daily frontier-intelligence digest ("Briefing" page).
--
-- briefing_editions: one curated edition per user per day (headline + intro),
--   UNIQUE(user_id, edition_date) so the daily refresh upserts idempotently.
-- briefing_items: the individual curated stories, grouped by `section` (stored
--   as text so the LLM taxonomy can evolve without a migration).
--
-- Applied by hand, idempotently (journal intentionally stale).
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
