-- 0030 — pages: Notion-style markdown documents + pages_projects junction.
--
-- Phase 20 — Pages tab. Mirrors the captures pattern end-to-end:
--   * pages: userId-scoped table with title/content/emoji/pinned/no_export and
--     the standard owner-only RLS quartet.
--   * pages_projects: M:N junction (denormalized user_id for RLS, same pattern
--     as captures_projects / tasks_projects). Deleting a project cascades the
--     junction row only — the page survives (unlink not delete).
--   * Both tables added to the supabase_realtime publication.
--   * pages attached to public.bump_user_state_version() (migration 0019) so
--     JARVIS's state-snapshot cache invalidates on page writes. pages_projects
--     is excluded from the trigger (it changes alongside pages writes; the
--     parent trigger already covers the relevant invalidation window).
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS everywhere. Realtime ADD TABLE is
-- wrapped in EXCEPTION WHEN duplicate_object so reruns are safe.

-- ── pages ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  emoji text,
  pinned boolean NOT NULL DEFAULT false,
  -- Phase 999.12 / CTX-04 — privacy gate for the MCP export. When true, this
  -- page is filtered out of the personal-context snapshot.
  no_export boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pages_user_updated_desc_idx
  ON public.pages (user_id, updated_at DESC);

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pages_select" ON public.pages;
CREATE POLICY "pages_select"
  ON public.pages FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pages_insert" ON public.pages;
CREATE POLICY "pages_insert"
  ON public.pages FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pages_update" ON public.pages;
CREATE POLICY "pages_update"
  ON public.pages FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pages_delete" ON public.pages;
CREATE POLICY "pages_delete"
  ON public.pages FOR DELETE
  USING (user_id = auth.uid());

-- ── pages_projects ───────────────────────────────────────────────────────────
-- M:N junction. user_id is denormalized for RLS (same pattern as
-- captures_projects / tasks_projects). ON DELETE CASCADE on BOTH FKs: deleting
-- a page OR a project removes only the junction row.
CREATE TABLE IF NOT EXISTS public.pages_projects (
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- denormalized for RLS
  PRIMARY KEY (page_id, project_id)
);

CREATE INDEX IF NOT EXISTS pages_projects_project_idx
  ON public.pages_projects (project_id);

CREATE INDEX IF NOT EXISTS pages_projects_user_idx
  ON public.pages_projects (user_id);

ALTER TABLE public.pages_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pages_projects_select" ON public.pages_projects;
CREATE POLICY "pages_projects_select"
  ON public.pages_projects FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pages_projects_insert" ON public.pages_projects;
CREATE POLICY "pages_projects_insert"
  ON public.pages_projects FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pages_projects_update" ON public.pages_projects;
CREATE POLICY "pages_projects_update"
  ON public.pages_projects FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pages_projects_delete" ON public.pages_projects;
CREATE POLICY "pages_projects_delete"
  ON public.pages_projects FOR DELETE
  USING (user_id = auth.uid());

-- ── Realtime publication ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pages';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pages_projects';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- ── state_version trigger (D-14 / CACHE-03 extension) ────────────────────────
-- public.bump_user_state_version() was created in migration 0019. Wiring pages
-- here means JARVIS's state-snapshot cache invalidates on page writes.
-- pages_projects is excluded — it changes alongside pages writes which already
-- bump the version.
DROP TRIGGER IF EXISTS bump_state_version_on_pages ON public.pages;
CREATE TRIGGER bump_state_version_on_pages
  BEFORE INSERT OR UPDATE OR DELETE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
