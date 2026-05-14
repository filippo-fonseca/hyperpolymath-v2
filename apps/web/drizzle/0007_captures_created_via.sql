ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "created_via" text;
CREATE INDEX IF NOT EXISTS "captures_created_via_idx" ON "captures" ("created_via") WHERE created_via IS NOT NULL;
