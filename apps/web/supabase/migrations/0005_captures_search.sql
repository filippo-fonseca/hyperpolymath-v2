-- Enable pg_trgm extension for trigram-based search and GIN-on-text indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- tsvector generated column over captures.content (English stemming)
ALTER TABLE "captures"
  ADD COLUMN "content_search" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;

-- GIN index for fast tsquery matching
CREATE INDEX "captures_content_search_gin_idx" ON "captures" USING gin ("content_search");

-- Secondary trigram GIN index on raw content for ILIKE-style substring search via pg_trgm
CREATE INDEX "captures_content_trgm_idx" ON "captures" USING gin ("content" gin_trgm_ops);
