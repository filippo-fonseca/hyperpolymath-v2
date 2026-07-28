-- JARVIS over text message (issue #352, decision D6 — Twilio Programmable
-- SMS/MMS behind a channel-agnostic core).
--
-- Two things land here:
--   1. users.sms_jarvis_* — the per-user gate on the inbound channel plus
--      last-reply telemetry for /settings#messaging. The flag DEFAULTS TO
--      FALSE: an assistant that silently starts auto-replying to text messages
--      is the bad failure mode, so the channel stays dark until it is switched
--      on deliberately.
--   2. jarvis_sms_events — the idempotency ledger, mirroring
--      agentmail_ingest_events (migration 0027). Twilio retries webhooks it
--      considers failed; message_sid as the primary key makes the insert the
--      replay lock.
--
-- Applied by hand, idempotently (the drizzle journal is intentionally stale).
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "sms_jarvis_enabled" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "sms_jarvis_last_reply_at" timestamptz;--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "sms_jarvis_last_status" text;--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "sms_jarvis_last_error" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "jarvis_sms_events" (
	"message_sid" text PRIMARY KEY,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"user_id" uuid,
	"turn_id" uuid,
	"status" text NOT NULL DEFAULT 'received',
	"error" text,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"processed_at" timestamptz
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "jarvis_sms_events" ADD CONSTRAINT "jarvis_sms_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "jarvis_sms_events_from_idx" ON "jarvis_sms_events" USING btree ("from_number", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jarvis_sms_events_created_idx" ON "jarvis_sms_events" USING btree ("created_at" DESC);--> statement-breakpoint

-- Internal table: RLS on, NO policies. `postgres` and `service_role` carry
-- BYPASSRLS so the server still reads it normally; no browser should ever be
-- able to read a table of phone numbers. Same treatment
-- agentmail_ingest_events got in migration 0032.
ALTER TABLE "jarvis_sms_events" ENABLE ROW LEVEL SECURITY;
