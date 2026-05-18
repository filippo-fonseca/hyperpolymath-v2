-- Phase 5.1 (D-M1 / JARVIS-18) — jarvis_facts persistent memory table.
--
-- Additive only. Stores one row per user-fact for whole-blob injection into
-- the cached system prompt (D-M4). UNIQUE(user_id, type, key) enforces
-- last-write-wins via onConflictDoUpdate. Hard-delete on forgetFactAction
-- (no deleted_at column — matches Phase 2 tasks/captures pattern).

CREATE TABLE IF NOT EXISTS public.jarvis_facts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        text        NOT NULL CHECK (type IN ('preference','rule','entity','workflow')),
  key         text        NOT NULL,
  value       text        NOT NULL,
  source      text        NOT NULL CHECK (source IN ('user_explicit','jarvis_suggested')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

ALTER TABLE public.jarvis_facts
  ADD CONSTRAINT jarvis_facts_user_type_key_unique
  UNIQUE (user_id, type, key);

CREATE INDEX IF NOT EXISTS jarvis_facts_user_type_idx
  ON public.jarvis_facts (user_id, type);

CREATE INDEX IF NOT EXISTS jarvis_facts_user_last_used_idx
  ON public.jarvis_facts (user_id, last_used_at DESC NULLS LAST);

ALTER TABLE public.jarvis_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jarvis_facts_owner_select" ON public.jarvis_facts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "jarvis_facts_owner_insert" ON public.jarvis_facts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "jarvis_facts_owner_update" ON public.jarvis_facts
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "jarvis_facts_owner_delete" ON public.jarvis_facts
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
