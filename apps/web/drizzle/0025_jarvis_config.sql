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
