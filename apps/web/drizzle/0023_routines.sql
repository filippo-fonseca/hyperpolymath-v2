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
