-- user_govee_devices — per-user Govee light registrations (SKU + device id).
-- capabilities_cache holds the last-fetched Govee device capabilities payload
-- (nullable until first sync). is_default marks the user's preferred light for
-- Jarvis one-shot commands. Applied by hand, idempotently (journal stale).
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
CREATE INDEX IF NOT EXISTS "user_govee_devices_user_idx" ON "user_govee_devices" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "user_govee_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "user_govee_devices_select_own" ON "user_govee_devices" FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "user_govee_devices_insert_own" ON "user_govee_devices" FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "user_govee_devices_update_own" ON "user_govee_devices" FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "user_govee_devices_delete_own" ON "user_govee_devices" FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
