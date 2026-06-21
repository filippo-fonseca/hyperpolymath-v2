-- 0033 — wiki folders: page_folders table + per-link folder placement on pages_projects.
--
-- Folders organize wiki pages WITHIN a project. The hierarchy is
-- Area > Project > Folder > Page. Folder placement is per project-link, not a
-- single field on the page: the same page can live in Project A's "Notes"
-- folder and Project B's "Drafts" folder (or loose) at the same time. So the
-- folder reference lives on the pages_projects junction row, not on pages.
--
-- Key design decisions:
--   * page_folders is userId-scoped with the standard owner-only RLS quartet,
--     and project_id ties each folder to exactly one project (ON DELETE CASCADE
--     — deleting a project removes its folders).
--   * pages_projects.folder_id is nullable (NULL = loose page under the project)
--     and references page_folders ON DELETE SET NULL, so deleting a folder
--     reparents its pages to loose rather than unlinking them.
--   * The app layer enforces that a junction row's folder_id belongs to a folder
--     whose project_id equals the junction's project_id (no cross-project filing).
--   * page_folders is added to the supabase_realtime publication and wired to
--     public.bump_user_state_version() so folder edits invalidate JARVIS's cache.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS everywhere. Realtime ADD TABLE is
-- wrapped in EXCEPTION WHEN duplicate_object so reruns are safe.

-- ── page_folders ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.page_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- the project this folder lives under; folders are project-scoped
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS page_folders_project_idx
  ON public.page_folders (project_id);

CREATE INDEX IF NOT EXISTS page_folders_user_idx
  ON public.page_folders (user_id);

ALTER TABLE public.page_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_folders_select" ON public.page_folders;
CREATE POLICY "page_folders_select"
  ON public.page_folders FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "page_folders_insert" ON public.page_folders;
CREATE POLICY "page_folders_insert"
  ON public.page_folders FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "page_folders_update" ON public.page_folders;
CREATE POLICY "page_folders_update"
  ON public.page_folders FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "page_folders_delete" ON public.page_folders;
CREATE POLICY "page_folders_delete"
  ON public.page_folders FOR DELETE
  USING (user_id = auth.uid());

-- ── pages_projects.folder_id ─────────────────────────────────────────────────
-- Per-link folder placement. NULL = loose page under the project. ON DELETE SET
-- NULL reparents a folder's pages to loose when the folder is removed.
ALTER TABLE public.pages_projects
  ADD COLUMN IF NOT EXISTS folder_id uuid
  REFERENCES public.page_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pages_projects_folder_idx
  ON public.pages_projects (folder_id);

-- ── Realtime publication ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.page_folders';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- ── state_version trigger (D-14 / CACHE-03 extension) ────────────────────────
-- public.bump_user_state_version() was created in migration 0019. Wiring
-- page_folders here invalidates JARVIS's state-snapshot cache on folder writes.
DROP TRIGGER IF EXISTS bump_state_version_on_page_folders ON public.page_folders;
CREATE TRIGGER bump_state_version_on_page_folders
  BEFORE INSERT OR UPDATE OR DELETE ON public.page_folders
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
