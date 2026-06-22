-- 0036 — Daily Page processing runs (issue #92, part 5).
--
-- Records every time a Daily Page is run through the in-document JARVIS engine
-- (the "Process this page" button). Two jobs:
--
--   1. Deterministic re-processing. Each run snapshots a content hash per
--      top-level block (block_hashes: { "<blockId>": "<hash>" }). The NEXT run
--      diffs the live document against the most recent run's snapshot and only
--      sends blocks that are new or changed, so re-processing an already-handled
--      day never double-creates the same tasks/events/captures. A run that finds
--      no changed blocks is recorded with status 'skipped' and no model call.
--
--   2. History. processed_block_ids + actions + response_text + status give the
--      per-page "Processing runs" dropdown (part 6) everything it needs to show
--      what each Process request did and when.
--
-- userId-scoped with the standard owner-only RLS quartet (defense-in-depth — the
-- real boundary is the Server Action, which re-derives userId via getClaims and
-- writes through the Drizzle pooler role that bypasses RLS). Added to the
-- supabase_realtime publication so the runs dropdown can invalidate live. No
-- bump_user_state_version trigger: processing runs are app history, not part of
-- JARVIS's world-state snapshot.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS everywhere; realtime ADD TABLE is
-- wrapped in EXCEPTION WHEN duplicate_object so reruns are safe.

CREATE TABLE IF NOT EXISTS public.jarvis_page_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  -- the assistant jarvis_turns row this run produced (NULL for 'skipped' runs or
  -- when no turn was created). Intentionally no FK: turns may be pruned
  -- independently and a dangling reference here is harmless history.
  turn_id uuid,
  scope text NOT NULL DEFAULT 'page',
  -- snapshot of every top-level block's content hash at processing time.
  block_hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- block ids actually sent to the model this run (new/changed vs last snapshot).
  processed_block_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- ScrollbackAction receipts produced this run.
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_text text,
  status text NOT NULL DEFAULT 'done', -- 'done' | 'error' | 'skipped'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- "latest run for this page" + the dropdown's reverse-chronological list.
CREATE INDEX IF NOT EXISTS jarvis_page_processing_runs_page_created_idx
  ON public.jarvis_page_processing_runs (page_id, created_at DESC);

CREATE INDEX IF NOT EXISTS jarvis_page_processing_runs_user_idx
  ON public.jarvis_page_processing_runs (user_id);

ALTER TABLE public.jarvis_page_processing_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jarvis_page_processing_runs_select" ON public.jarvis_page_processing_runs;
CREATE POLICY "jarvis_page_processing_runs_select"
  ON public.jarvis_page_processing_runs FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "jarvis_page_processing_runs_insert" ON public.jarvis_page_processing_runs;
CREATE POLICY "jarvis_page_processing_runs_insert"
  ON public.jarvis_page_processing_runs FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "jarvis_page_processing_runs_update" ON public.jarvis_page_processing_runs;
CREATE POLICY "jarvis_page_processing_runs_update"
  ON public.jarvis_page_processing_runs FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "jarvis_page_processing_runs_delete" ON public.jarvis_page_processing_runs;
CREATE POLICY "jarvis_page_processing_runs_delete"
  ON public.jarvis_page_processing_runs FOR DELETE
  USING (user_id = auth.uid());

-- Realtime so the per-page runs dropdown can invalidate live.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_page_processing_runs';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;
