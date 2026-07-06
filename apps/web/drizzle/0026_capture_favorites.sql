ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "favorite" boolean DEFAULT false NOT NULL;
CREATE INDEX IF NOT EXISTS "captures_user_favorite_created_desc_idx" ON "captures" ("user_id", "favorite", "created_at" DESC);
