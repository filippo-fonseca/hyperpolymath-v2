CREATE TYPE "public"."priority" AS ENUM('P∞', 'P1', 'P2', 'P3');
CREATE TYPE "public"."semester_term" AS ENUM('fall', 'spring', 'summer');
CREATE TYPE "public"."task_status" AS ENUM('not started', 'up next', 'in progress', 'almost done', 'lesno');
CREATE TABLE IF NOT EXISTS "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "captures_hashtags" (
	"capture_id" uuid NOT NULL,
	"hashtag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "captures_hashtags_capture_id_hashtag_id_pk" PRIMARY KEY("capture_id","hashtag_id")
);

CREATE TABLE IF NOT EXISTS "captures_projects" (
	"capture_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "captures_projects_capture_id_project_id_pk" PRIMARY KEY("capture_id","project_id")
);

CREATE TABLE IF NOT EXISTS "hashtags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kiwi_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"turn_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action_types" text[],
	"latency_ms" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"error_code" text,
	"metadata" jsonb
);

CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"banner_url" text,
	"start_date" date,
	"end_date" date,
	"archived_at" timestamp with time zone,
	"is_class" boolean DEFAULT false NOT NULL,
	"course_code" text,
	"course_title" text,
	"instructor" text,
	"grade" text,
	"credits" integer,
	"distributionals" text[],
	"semester_term" "semester_term",
	"semester_year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_fields_consistent" CHECK (("projects"."is_class" = false) OR ("projects"."is_class" = true AND "projects"."course_code" IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"priority" "priority" DEFAULT 'P3' NOT NULL,
	"status" "task_status" DEFAULT 'not started' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tasks_projects" (
	"task_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "tasks_projects_task_id_project_id_pk" PRIMARY KEY("task_id","project_id")
);

CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"graduation_year" integer,
	"onboarded_at" timestamp with time zone,
	"gcal_refresh_token" text,
	"gcal_access_token" text,
	"gcal_token_expires_at" timestamp with time zone,
	"theme" text DEFAULT 'light',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "areas" ADD CONSTRAINT "areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "captures" ADD CONSTRAINT "captures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "captures_hashtags" ADD CONSTRAINT "captures_hashtags_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "captures_hashtags" ADD CONSTRAINT "captures_hashtags_hashtag_id_hashtags_id_fk" FOREIGN KEY ("hashtag_id") REFERENCES "public"."hashtags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "captures_projects" ADD CONSTRAINT "captures_projects_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "captures_projects" ADD CONSTRAINT "captures_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hashtags" ADD CONSTRAINT "hashtags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "kiwi_events" ADD CONSTRAINT "kiwi_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "tasks_projects" ADD CONSTRAINT "tasks_projects_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "tasks_projects" ADD CONSTRAINT "tasks_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "areas_user_active_idx" ON "areas" USING btree ("user_id") WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS "captures_user_created_desc_idx" ON "captures" USING btree ("user_id",created_at DESC);
CREATE INDEX IF NOT EXISTS "captures_hashtags_hashtag_idx" ON "captures_hashtags" USING btree ("hashtag_id");
CREATE INDEX IF NOT EXISTS "captures_hashtags_user_idx" ON "captures_hashtags" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "captures_projects_project_idx" ON "captures_projects" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "captures_projects_user_idx" ON "captures_projects" USING btree ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "hashtags_user_name_uniq" ON "hashtags" USING btree ("user_id","name");
CREATE INDEX IF NOT EXISTS "kiwi_events_user_turn_idx" ON "kiwi_events" USING btree ("user_id",turn_at DESC);
CREATE INDEX IF NOT EXISTS "projects_user_area_active_idx" ON "projects" USING btree ("user_id","area_id") WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS "projects_user_class_idx" ON "projects" USING btree ("user_id","is_class") WHERE is_class = true;
CREATE INDEX IF NOT EXISTS "tasks_user_status_idx" ON "tasks" USING btree ("user_id","status");
CREATE INDEX IF NOT EXISTS "tasks_user_due_idx" ON "tasks" USING btree ("user_id","due_date") WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS "tasks_projects_project_idx" ON "tasks_projects" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "tasks_projects_user_idx" ON "tasks_projects" USING btree ("user_id");

-- Cross-schema FK: public.users.id mirrors auth.users.id (D-CONTEXT integration point).
-- Drizzle cannot declare this directly; appended manually here.
ALTER TABLE public.users
  ADD CONSTRAINT users_id_auth_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;