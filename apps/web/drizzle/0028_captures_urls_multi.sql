-- 0028 — Multi-URL property on captures.
--
-- Adds a `urls text[]` column holding the full set of links attached to a
-- capture: manual entries plus any auto-derived from the body. The existing
-- single `url` column stays as the primary/canonical link (mirrors urls[0]) so
-- current single-link reads keep working. Additive + idempotent; every existing
-- row gets the empty-array default and is left otherwise untouched. Existing rows
-- are populated from their content by the backfill script
-- (apps/web/scripts/backfill-capture-urls.mjs), run out of band after this DDL.
ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "urls" text[] DEFAULT '{}'::text[] NOT NULL;
