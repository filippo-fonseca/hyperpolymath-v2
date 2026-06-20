-- Phase 20 — pages: Notion-style markdown documents + pages_projects junction.
-- Each page is owned by a user and may be linked to zero or more projects (M:N).
-- Deleting a project cascades the junction row only; the page survives
-- (unlink not delete). RLS + realtime + state-version triggers are wired in the
-- paired Supabase migration (supabase/migrations/0030_pages.sql).
CREATE TABLE IF NOT EXISTS "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"emoji" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"no_export" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pages_projects" (
	"page_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "pages_projects_page_id_project_id_pk" PRIMARY KEY("page_id","project_id"),
	CONSTRAINT "pages_projects_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "pages_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_user_updated_desc_idx" ON "pages" USING btree ("user_id","updated_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_projects_project_idx" ON "pages_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_projects_user_idx" ON "pages_projects" USING btree ("user_id");
