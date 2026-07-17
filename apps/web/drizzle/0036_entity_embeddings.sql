-- 0036 — entity_embeddings: the semantic index behind the @-mention picker.
--
-- The exact-match reference search (searchEntityMentions, S4) stays exactly as
-- it is: title/name ILIKE plus the captures tsvector. This table backs a
-- SECOND, staged path — a flag-gated "Related" section that finds entities the
-- literal query never would ("running plan" surfacing a capture titled
-- "marathon block"). Nothing here is on the exact path's critical route.
--
-- One row per (entity_type, entity_id): the entity's current embedding plus the
-- content_hash it was built from. The hash is the whole reason the write path
-- can be a cheap fire-and-forget — a save whose normalized text is unchanged
-- matches the stored hash and skips the embed round trip entirely.
--
-- Vectors are gte-small (384-dim), produced by the embed-entity edge function's
-- built-in Supabase.ai inference — no external vendor, no API key. user_id is
-- denormalized (as everywhere in this schema) so RLS stays a plain column
-- compare; entity_id carries no FK because the target is polymorphic across six
-- tables, same reasoning as entity_references and people_references.
--
-- Applied by hand, idempotently (journal intentionally stale).

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "entity_embeddings" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'capture' | 'task' | 'page' | 'project' | 'area' | 'person' — the embedded entity.
  "entity_type"  text NOT NULL,
  "entity_id"    uuid NOT NULL,
  -- sha256 of the normalized (title + body) the embedding was built from. The
  -- short-circuit key: an unchanged hash means an unchanged embedding.
  "content_hash" text NOT NULL,
  "embedding"    vector(384) NOT NULL,
  "updated_at"   timestamptz NOT NULL DEFAULT now(),
  -- One embedding per entity; the enqueue upserts on this constraint.
  CONSTRAINT "entity_embeddings_entity_uniq"
    UNIQUE ("entity_type", "entity_id")
);
--> statement-breakpoint

-- Cosine ANN index. HNSW rather than IVFFlat on purpose: at single-user scale
-- (thousands of rows, not millions) IVFFlat's list tuning and training-set
-- requirement buy nothing and degrade recall on a small table, while HNSW needs
-- no training, gives strong recall out of the box, and its higher build cost is
-- irrelevant here. vector_cosine_ops because the query ranks by cosine distance
-- (`<=>`) and floors on cosine similarity.
CREATE INDEX IF NOT EXISTS "entity_embeddings_embedding_hnsw_idx"
  ON "entity_embeddings" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entity_embeddings_user_idx"
  ON "entity_embeddings" ("user_id");
--> statement-breakpoint

-- RLS, per the pattern in 0032/0050/0034. The app reads through Drizzle as
-- `postgres` (BYPASSRLS), so this changes nothing about the server path; it
-- closes the PostgREST/Realtime door reachable with the public anon key.
ALTER TABLE "entity_embeddings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entity_embeddings'] LOOP
    -- Skip a table absent in this database rather than abort the run: the two
    -- migration dirs have drifted historically and not every DB has every table.
    CONTINUE WHEN to_regclass('public.' || quote_ident(t)) IS NULL;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())',
      t || '_select_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())',
      t || '_insert_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_update_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
      t || '_update_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())',
      t || '_delete_own', t);
  END LOOP;
END $$;
