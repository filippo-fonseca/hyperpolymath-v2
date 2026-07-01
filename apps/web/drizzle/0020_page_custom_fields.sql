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
