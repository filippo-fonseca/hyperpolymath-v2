-- 0030 — journaling: journal_entries table + UNIQUE(user_id, date) + index + RLS + Realtime publication + state_version trigger.
--
-- Phase 20 — daily journal tab. One journal entry per user per calendar day:
--   * journal_entries is userId-scoped with the standard owner-only RLS quartet.
--   * UNIQUE(user_id, date) is the one-entry-per-day guarantee; it backs the
--     ON CONFLICT (user_id, date) DO UPDATE upsert in plan 20-02.
--   * no_export boolean mirrors captures/tasks (migration 0027) — the privacy
--     gate that filters an entry out of the personal-context MCP snapshot.
--   * journal_entries is added to the supabase_realtime publication so the
--     history feed stays live (JOURNAL-RT-01).
--   * journal_entries is attached to public.bump_user_state_version() (introduced
--     in migration 0019) so JARVIS's state-snapshot cache invalidates on journal
--     writes, matching the other primary tables.
--
-- Key design decisions:
--   * date is DATE (no time component) — the client-local calendar day
--     "YYYY-MM-DD", not server UTC (matches food_logs.log_date intent at 0029).
--   * The journaling prompt is a fixed UI constant, NOT a column.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS everywhere. Realtime ADD TABLE
-- is wrapped in EXCEPTION WHEN duplicate_object so reruns are safe.

-- ── journal_entries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- client-local calendar day "YYYY-MM-DD", not server UTC (matches food_logs.log_date)
  date date NOT NULL,
  main_response text,   -- nullable — the fixed-prompt response
  notes_section text,   -- nullable — the separate Notes / Misc field
  -- privacy gate; mirrors captures/tasks per migration 0027
  no_export boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- one entry per (user, day); backs ON CONFLICT (user_id, date) DO UPDATE in plan 20-02
  CONSTRAINT journal_entries_user_date_uniq UNIQUE (user_id, date)
);

-- History-feed ordering (most-recent-first). The UNIQUE above already provides
-- the conflict target; this DESC index serves the feed query.
CREATE INDEX IF NOT EXISTS journal_entries_user_date_desc_idx
  ON public.journal_entries (user_id, date DESC);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_entries_select" ON public.journal_entries;
CREATE POLICY "journal_entries_select"
  ON public.journal_entries FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_entries_insert" ON public.journal_entries;
CREATE POLICY "journal_entries_insert"
  ON public.journal_entries FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_entries_update" ON public.journal_entries;
CREATE POLICY "journal_entries_update"
  ON public.journal_entries FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_entries_delete" ON public.journal_entries;
CREATE POLICY "journal_entries_delete"
  ON public.journal_entries FOR DELETE
  USING (user_id = auth.uid());

-- ── Realtime publication ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- ── state_version trigger (D-14 / CACHE-03 extension) ────────────────────────
-- public.bump_user_state_version() was created in migration 0019. Wiring
-- journal_entries here gives JARVIS automatic snapshot-cache invalidation on
-- journal writes with zero application-layer effort.
DROP TRIGGER IF EXISTS bump_state_version_on_journal_entries ON public.journal_entries;
CREATE TRIGGER bump_state_version_on_journal_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
