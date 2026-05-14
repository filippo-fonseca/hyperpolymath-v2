-- Phase 5 Plan 05-02 — jarvis_events telemetry table (RES-05).
--
-- Additive only. Stores one row per JARVIS turn for /insights surfacing
-- in Phase 6 (RES-06) and live debugging of prompt-caching hit rate
-- (JARVIS-11) + first-token latency (JARVIS-15).
--
-- RLS: owner-only SELECT + INSERT. No UPDATE/DELETE policies — telemetry
-- is write-once. The user_id column is denormalized for direct RLS use
-- (matches the Phase 1 pattern; auth.uid() == user_id).

CREATE TABLE IF NOT EXISTS public.jarvis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  prompt_text text NOT NULL,
  pre_parsed_dates jsonb,
  slash_command_mode text,
  voice_active boolean NOT NULL DEFAULT false,
  action_types text[],
  cache_read_input_tokens int,
  cache_creation_input_tokens int,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  first_token_ms int,
  error text
);

CREATE INDEX IF NOT EXISTS jarvis_events_user_created_idx
  ON public.jarvis_events (user_id, created_at DESC);

ALTER TABLE public.jarvis_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jarvis_events_owner_select" ON public.jarvis_events
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "jarvis_events_owner_insert" ON public.jarvis_events
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
