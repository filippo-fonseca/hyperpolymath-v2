-- 0053 — mirror of drizzle/0035_captures_trgm_parity.sql.
--
-- Kept byte-identical to its drizzle counterpart below the header, per the
-- rule documented in 0049: a new drizzle migration is mirrored here in the
-- same commit, or the two directories drift again. A no-op in this direction —
-- 0005 already created both objects — but mirrored anyway so the two dirs keep
-- describing the same database, as 0033 does for the API role grants.

-- 0035 — pg_trgm + the captures trigram index, which this directory never got.
--
-- Long-standing drift. supabase/migrations/0005_captures_search.sql creates
-- three things: the captures.content_search tsvector, its GIN index, and — via
-- `CREATE EXTENSION pg_trgm` plus captures_content_trgm_idx — trigram search
-- over the raw content. The drizzle twin (0003_captures_search.sql) only ever
-- created the first two. So the extension and the trigram index exist on any
-- database built from supabase/, and are missing from any database built from
-- drizzle/.
--
-- That gap became load-bearing with the reference picker: searchEntityMentions
-- falls back to pg_trgm similarity when a capture doesn't match the tsquery,
-- and captures are the one referenceable entity with no title to match against.
-- Without this, the fallback errors out on `similarity()` not existing rather
-- than degrading.
--
-- No-op on production, which was built from drizzle/ but has been hand-patched,
-- and on any database built from supabase/, which already has all of it. Both
-- statements are guarded, so this is safe to re-run anywhere. Kept in both
-- directories regardless, per the rule in 0049 and the precedent in 0033.
--
-- Applied by hand, idempotently (journal intentionally stale).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- Trigram GIN over the raw content, for ILIKE-style and similarity() search.
-- Complements captures_content_search_gin_idx (tsvector/stemmed) rather than
-- replacing it: the tsvector handles words, trigrams handle fragments.
CREATE INDEX IF NOT EXISTS "captures_content_trgm_idx"
  ON "captures" USING gin ("content" gin_trgm_ops);
