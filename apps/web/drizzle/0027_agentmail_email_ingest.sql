ALTER TABLE "captures"
ADD COLUMN IF NOT EXISTS "source_channel" text;

CREATE TABLE IF NOT EXISTS "agentmail_ingest_events" (
  "event_id" text PRIMARY KEY,
  "inbox_id" text NOT NULL,
  "message_id" text NOT NULL,
  "sender" text,
  "subject" text,
  "capture_id" uuid,
  "status" text NOT NULL DEFAULT 'received',
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "agentmail_ingest_events_message_idx"
ON "agentmail_ingest_events" ("inbox_id", "message_id");

CREATE INDEX IF NOT EXISTS "agentmail_ingest_events_created_idx"
ON "agentmail_ingest_events" ("created_at" DESC);
