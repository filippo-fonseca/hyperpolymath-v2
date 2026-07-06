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
