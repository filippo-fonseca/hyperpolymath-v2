-- 0034 — wiki data-model restructure: decouple folders from projects, add
-- arbitrary-depth nesting, replace the required project link with an M:N junction.
--
-- Requires 0033_page_folders.sql applied first (this migration references
-- public.page_folders, which 0033 creates).
--
-- Phase 21 — Wiki data-model restructure. What changes:
--   * page_folders gains a nullable parent_id self-FK (ON DELETE CASCADE) so
--     folders nest arbitrarily deep; deleting a parent cascades its subtree
--     (locked decision 4). A CHECK (id <> parent_id) blocks the trivial cycle
--     (locked decision 5 — DB half of cycle prevention; app-layer ancestor walk
--     is the other half).
--   * A new folder_projects junction (folder_id, project_id, user_id) carries the
--     M:N folder->project links with the standard owner-only RLS quartet keyed on
--     user_id = auth.uid() (locked decision 6). UNIQUE (folder_id, project_id).
--   * Existing folder->project links are backfilled into folder_projects BEFORE
--     page_folders.project_id is dropped (data preserved — WIKI-MODEL-02).
--   * Folder placement of a page moves OFF the per-project-link junction
--     (pages_projects.folder_id) ONTO a direct pages.folder_id column (FK ->
--     page_folders, ON DELETE SET NULL) — a page sits in one folder globally,
--     not one per project link (locked decision 3).
--   * folder_projects is added to supabase_realtime and wired to
--     public.bump_user_state_version() so link edits invalidate JARVIS's cache.
--
-- The statement ORDER is load-bearing: the backfill INSERT (step 7) MUST run
-- BEFORE the page_folders.project_id DROP (step 10) or the links are lost.
--
-- Idempotent: IF NOT EXISTS / IF EXISTS / ADD COLUMN IF NOT EXISTS / DROP ...
-- IF EXISTS / ON CONFLICT DO NOTHING / DROP POLICY IF EXISTS everywhere. The
-- CHECK constraint, Realtime ADD TABLE, and trigger are all guarded so reruns
-- are safe.

-- ── (1) page_folders.parent_id self-FK (nullable, ON DELETE CASCADE) ──────────
ALTER TABLE public.page_folders
  ADD COLUMN IF NOT EXISTS parent_id uuid
  REFERENCES public.page_folders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS page_folders_parent_idx
  ON public.page_folders (parent_id);

-- ── (2) no_self_parent CHECK (id <> parent_id) — guarded for re-run safety ────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_self_parent'
      AND conrelid = 'public.page_folders'::regclass
  ) THEN
    ALTER TABLE public.page_folders
      ADD CONSTRAINT no_self_parent CHECK (id <> parent_id);
  END IF;
END
$$;

-- ── (3) folder_projects junction ─────────────────────────────────────────────
-- M:N folder->project links. user_id is denormalized for RLS (same pattern as
-- pages_projects). ON DELETE CASCADE on both FKs: deleting a folder or a project
-- removes only the link row. UNIQUE (folder_id, project_id) — a folder links a
-- project at most once (locked decision 6).
CREATE TABLE IF NOT EXISTS public.folder_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.page_folders(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- denormalized for RLS
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folder_id, project_id)
);

CREATE INDEX IF NOT EXISTS folder_projects_project_idx
  ON public.folder_projects (project_id);

CREATE INDEX IF NOT EXISTS folder_projects_user_idx
  ON public.folder_projects (user_id);

-- ── (4) folder_projects RLS quartet (verbatim from the 0033 page_folders set) ─
ALTER TABLE public.folder_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "folder_projects_select" ON public.folder_projects;
CREATE POLICY "folder_projects_select"
  ON public.folder_projects FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "folder_projects_insert" ON public.folder_projects;
CREATE POLICY "folder_projects_insert"
  ON public.folder_projects FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "folder_projects_update" ON public.folder_projects;
CREATE POLICY "folder_projects_update"
  ON public.folder_projects FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "folder_projects_delete" ON public.folder_projects;
CREATE POLICY "folder_projects_delete"
  ON public.folder_projects FOR DELETE
  USING (user_id = auth.uid());

-- ── (5) Realtime publication (idempotent) ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.folder_projects';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- ── (6) state_version trigger (D-14 / CACHE-03 extension) ─────────────────────
-- public.bump_user_state_version() was created in migration 0019. Wiring
-- folder_projects here invalidates JARVIS's state-snapshot cache on link writes.
DROP TRIGGER IF EXISTS bump_state_version_on_folder_projects ON public.folder_projects;
CREATE TRIGGER bump_state_version_on_folder_projects
  BEFORE INSERT OR UPDATE OR DELETE ON public.folder_projects
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

-- ── (7) BACKFILL existing folder->project links (BEFORE dropping project_id) ──
-- Every pre-existing folder had a NOT NULL project_id; preserve those as
-- folder_projects rows. ON CONFLICT DO NOTHING makes the backfill idempotent on
-- the data side; the column-existence guard makes it idempotent on the schema
-- side — on a re-run project_id is already dropped (step 10), so referencing it
-- directly would error at parse time. The dynamic EXECUTE defers binding until
-- we've confirmed the column still exists, so re-running the whole file is safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'page_folders'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $backfill$
      INSERT INTO public.folder_projects (folder_id, project_id, user_id)
        SELECT id, project_id, user_id
        FROM public.page_folders
        WHERE project_id IS NOT NULL
      ON CONFLICT (folder_id, project_id) DO NOTHING
    $backfill$;
  END IF;
END
$$;

-- ── (8) pages.folder_id — direct folder placement on the page ────────────────
-- Folder placement is now a single field on the page (locked decision 3), not
-- per-project-link. NULL = standalone (no folder). ON DELETE SET NULL reparents
-- a folder's pages to standalone when the folder is removed.
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS folder_id uuid
  REFERENCES public.page_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pages_folder_idx
  ON public.pages (folder_id);

-- ── (9) Drop the now-redundant per-project-link placement ────────────────────
-- pages_projects.folder_id is superseded by pages.folder_id.
DROP INDEX IF EXISTS pages_projects_folder_idx;
ALTER TABLE public.pages_projects
  DROP COLUMN IF EXISTS folder_id;

-- ── (10) Drop page_folders.project_id (ONLY AFTER the backfill in step 7) ─────
-- Folders are project-independent now; folder_projects is the canonical link
-- (WIKI-MODEL-02). The orphaned project index goes too.
DROP INDEX IF EXISTS page_folders_project_idx;
ALTER TABLE public.page_folders
  DROP COLUMN IF EXISTS project_id;
