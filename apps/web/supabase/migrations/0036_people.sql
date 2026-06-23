-- 0036 — people + people_references: first-class person entity for the
-- knowledge graph.
--
-- Phase People. People are curatable contacts (email / phone / bio / avatar /
-- tags) that can be @-mentioned from anywhere there is text (wiki pages,
-- captures, JARVIS chat) and linked to tasks/captures/events. Mirrors the
-- pages pattern end-to-end:
--   * people: userId-scoped table with the standard owner-only RLS quartet.
--   * people_references: (from_type, from_id) -> person_id mention rows.
--     user_id denormalized for RLS (same pattern as pages_projects). person FK
--     cascades; the from-entity is a soft (type, id) pair because it can be a
--     task, capture, page, jarvis_fact, or event.
--   * Both tables added to the supabase_realtime publication.
--   * people attached to public.bump_user_state_version() (migration 0019) so
--     JARVIS's state-snapshot cache invalidates on person writes.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS everywhere. Realtime ADD TABLE is
-- wrapped in EXCEPTION WHEN duplicate_object so reruns are safe.

-- ── people ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  bio text,
  avatar_url text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS people_user_idx
  ON public.people (user_id);

-- Case-insensitive resolve-or-create lookups by (user, lower(name)).
CREATE INDEX IF NOT EXISTS people_user_name_idx
  ON public.people (user_id, lower(name));

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "people_select" ON public.people;
CREATE POLICY "people_select"
  ON public.people FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "people_insert" ON public.people;
CREATE POLICY "people_insert"
  ON public.people FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "people_update" ON public.people;
CREATE POLICY "people_update"
  ON public.people FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "people_delete" ON public.people;
CREATE POLICY "people_delete"
  ON public.people FOR DELETE
  USING (user_id = auth.uid());

-- ── people_references ─────────────────────────────────────────────────────────
-- One row per (from-entity, person) mention. user_id denormalized for RLS.
-- person_id cascades on person delete; the from-entity reference is a soft
-- (type, id) pair so the same table serves tasks/captures/pages/facts/events.
CREATE TABLE IF NOT EXISTS public.people_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- denormalized for RLS
  from_type text NOT NULL,
  from_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_type, from_id, person_id)
);

CREATE INDEX IF NOT EXISTS people_references_person_idx
  ON public.people_references (person_id);

CREATE INDEX IF NOT EXISTS people_references_user_idx
  ON public.people_references (user_id);

CREATE INDEX IF NOT EXISTS people_references_from_idx
  ON public.people_references (from_type, from_id);

ALTER TABLE public.people_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "people_references_select" ON public.people_references;
CREATE POLICY "people_references_select"
  ON public.people_references FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "people_references_insert" ON public.people_references;
CREATE POLICY "people_references_insert"
  ON public.people_references FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "people_references_update" ON public.people_references;
CREATE POLICY "people_references_update"
  ON public.people_references FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "people_references_delete" ON public.people_references;
CREATE POLICY "people_references_delete"
  ON public.people_references FOR DELETE
  USING (user_id = auth.uid());

-- ── Realtime publication ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.people';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.people_references';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- ── state_version trigger (D-14 / CACHE-03 extension) ────────────────────────
-- public.bump_user_state_version() was created in migration 0019. Wiring people
-- here means JARVIS's state-snapshot cache invalidates on person writes.
-- people_references is excluded — it changes alongside content writes which
-- already bump the version.
DROP TRIGGER IF EXISTS bump_state_version_on_people ON public.people;
CREATE TRIGGER bump_state_version_on_people
  BEFORE INSERT OR UPDATE OR DELETE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
