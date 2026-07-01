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
