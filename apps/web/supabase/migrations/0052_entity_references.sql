-- 0052 — mirror of drizzle/0034_entity_references.sql.
--
-- Kept byte-identical to its drizzle counterpart below the header, per the
-- rule documented in 0049: a new drizzle migration is mirrored here in the
-- same commit, or the two directories drift again.

-- 0034 — entity_references: the index of what references what.
--
-- Generalizes people_references. That table answers "which entities mention
-- this person" via a (from_type, from_id) -> person_id triple; this one drops
-- the person-shaped end and stores a (target_type, target_id) pair too, so any
-- entity can reference any other:
--
--   people_references   (from_type, from_id) -> person_id
--   entity_references   (source_type, source_id) -> (target_type, target_id)
--
-- Neither end carries a real FK, for the same reason people_references.from_id
-- doesn't: both ends are polymorphic and Postgres has no FK to a union of
-- tables. Referential integrity is the app's job — reconciled on save by
-- lib/references/reconcile.ts (parse the source's content for tokens, diff
-- against the existing rows) and cleaned up in the delete actions.
--
-- The tokens themselves live in the source's text (see lib/references/token.ts).
-- This table is the queryable projection of them: it exists so "what links to
-- this?" is an index scan instead of a full-text sweep over every capture, and
-- so the captures graph can join captures to a shared target.
--
-- user_id is denormalized onto every row, matching every other junction table
-- in this schema (see the note at schema.ts:382) — it keeps the RLS policy a
-- plain column compare instead of a recursive join back through the source.
--
-- Applied by hand, idempotently (journal intentionally stale).

CREATE TABLE IF NOT EXISTS "entity_references" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'capture' | 'task' | 'page' | 'jarvis_turn' — the entity holding the token.
  "source_type" text NOT NULL,
  "source_id"   uuid NOT NULL,
  -- 'capture' | 'task' | 'page' | 'project' | 'area' | 'person' — the target.
  "target_type" text NOT NULL,
  "target_id"   uuid NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  -- Re-saving a source that names the same target twice collapses to one row,
  -- which is also what makes the reconcile diff idempotent.
  CONSTRAINT "entity_references_source_target_uniq"
    UNIQUE ("source_type", "source_id", "target_type", "target_id")
);
--> statement-breakpoint

-- "what references this entity" — backlinks, reference counts, the graph.
CREATE INDEX IF NOT EXISTS "entity_references_target_idx"
  ON "entity_references" ("target_type", "target_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entity_references_user_idx"
  ON "entity_references" ("user_id");
--> statement-breakpoint

-- "what does this entity reference" — the reconcile read, on every save.
CREATE INDEX IF NOT EXISTS "entity_references_source_idx"
  ON "entity_references" ("source_type", "source_id");
--> statement-breakpoint

-- RLS, per the pattern in 0032/0050. The app itself reads through Drizzle as
-- `postgres` (BYPASSRLS), so this changes nothing about the server path; it
-- closes the PostgREST/Realtime door that the public anon key can otherwise
-- open. entity_references is on the Realtime publication path, so it needs a
-- SELECT policy for `authenticated` rather than deny-all.
ALTER TABLE "entity_references" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entity_references'] LOOP
    -- Skip a table that is absent in this database rather than abort the run:
    -- the two migration dirs have drifted historically and not every database
    -- has every table.
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
