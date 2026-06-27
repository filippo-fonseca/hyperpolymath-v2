CREATE TABLE IF NOT EXISTS "tasks_hashtags" (
	"task_id" uuid NOT NULL,
	"hashtag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "tasks_hashtags_task_id_hashtag_id_pk" PRIMARY KEY("task_id","hashtag_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_hashtags" ADD CONSTRAINT "tasks_hashtags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_hashtags" ADD CONSTRAINT "tasks_hashtags_hashtag_id_hashtags_id_fk" FOREIGN KEY ("hashtag_id") REFERENCES "public"."hashtags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_hashtags_hashtag_idx" ON "tasks_hashtags" USING btree ("hashtag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_hashtags_user_idx" ON "tasks_hashtags" USING btree ("user_id");
