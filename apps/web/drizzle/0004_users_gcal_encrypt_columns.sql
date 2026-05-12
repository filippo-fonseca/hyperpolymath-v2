ALTER TABLE "users" ADD COLUMN "gcal_refresh_token_encrypted" "bytea";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gcal_access_token_encrypted" "bytea";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gcal_default_calendar_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gcal_visible_calendar_ids" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text;