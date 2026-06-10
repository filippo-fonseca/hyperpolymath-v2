-- 0026 — personal context graph: nightly snapshot storage for the MCP export.
-- One row per (user_id, snapshot_date). Payload is the typed graph (nodes + edges + meta)
-- serialized as JSONB. schema_version supports forever-snapshot read-time migrations
-- (per RESEARCH.md Pitfall 3 — never mutate historical rows).
--
-- INTENTIONALLY NOT added to supabase_realtime publication (RESEARCH.md Pitfall 4).
-- Snapshots do not need live updates; broadcasting them would leak the JSON payload
-- over websockets.

CREATE TABLE IF NOT EXISTS public.personal_context_snapshots (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  schema_version integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS personal_context_snapshots_user_created_idx
  ON public.personal_context_snapshots (user_id, created_at DESC);

ALTER TABLE public.personal_context_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_context_snapshots_select_own" ON public.personal_context_snapshots;
CREATE POLICY "personal_context_snapshots_select_own"
  ON public.personal_context_snapshots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "personal_context_snapshots_insert_own" ON public.personal_context_snapshots;
CREATE POLICY "personal_context_snapshots_insert_own"
  ON public.personal_context_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "personal_context_snapshots_update_own" ON public.personal_context_snapshots;
CREATE POLICY "personal_context_snapshots_update_own"
  ON public.personal_context_snapshots FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "personal_context_snapshots_delete_own" ON public.personal_context_snapshots;
CREATE POLICY "personal_context_snapshots_delete_own"
  ON public.personal_context_snapshots FOR DELETE
  USING (auth.uid() = user_id);
