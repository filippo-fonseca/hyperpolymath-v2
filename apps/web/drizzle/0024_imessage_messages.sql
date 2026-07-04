-- iMessage integration — messages synced from the local macOS Messages
-- chat.db by a small local sync worker (separate unit `imessage-sync`) that
-- POSTs new rows to /api/imessage/ingest. Mirrors whatsapp_messages so the
-- server-side `read_imessage` JARVIS tool (and daily briefings) can query
-- iMessage without a mid-turn desktop round-trip.
--
-- Applied by hand, idempotently (journal intentionally stale).
CREATE TABLE IF NOT EXISTS "imessage_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"chat_jid" text NOT NULL,
	"chat_name" text,
	"sender" text,
	"sender_name" text,
	"from_me" boolean DEFAULT false NOT NULL,
	"body" text,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "imessage_messages" ADD CONSTRAINT "imessage_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "imessage_messages_user_chat_external_uniq" ON "imessage_messages" USING btree ("user_id","chat_jid","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "imessage_messages_user_sent_at_idx" ON "imessage_messages" USING btree ("user_id","sent_at" DESC);
