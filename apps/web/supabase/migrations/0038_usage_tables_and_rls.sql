-- 0038 - Backfill usage tables into the prod (supabase) migration tree + RLS.
--
-- Two tables (claude_subscription_usage, anthropic_api_usage) were defined in
-- Drizzle and in the stale drizzle/ migration tree (0016, 0017) but were never
-- copied into supabase/migrations/, which is the tree actually applied to prod.
-- Result in prod: the "Claude Code" / Anthropic usage cards throw
--   relation "claude_subscription_usage" does not exist
-- This migration creates them here (idempotent) so prod gets them.
--
-- It also enables owner-only RLS on the four telemetry/usage tables that the
-- security audit flagged as RLS-less (defense-in-depth; the real boundary is
-- the server-side userId filter through the RLS-bypassing pooler role). The two
-- pre-existing tables (cron_runs, kiwi_dev_runs) are guarded by to_regclass so
-- this is safe whether or not they exist on a given environment.

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.claude_subscription_usage (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  bucket_key text NOT NULL,
  cost_usd_micros integer,
  total_tokens bigint NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cache_read_tokens bigint NOT NULL DEFAULT 0,
  cache_creation_tokens bigint NOT NULL DEFAULT 0,
  window_start timestamptz,
  window_end timestamptz,
  projected_cost_usd_micros integer,
  projected_total_tokens bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claude_subscription_usage_pk PRIMARY KEY (user_id, kind, bucket_key)
);

CREATE TABLE IF NOT EXISTS public.anthropic_api_usage (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cache_read_tokens bigint NOT NULL DEFAULT 0,
  cache_creation_tokens bigint NOT NULL DEFAULT 0,
  total_tokens bigint NOT NULL DEFAULT 0,
  cost_usd_micros integer,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anthropic_api_usage_pk PRIMARY KEY (user_id, date)
);

-- ── Owner-only RLS for all four usage/telemetry tables ───────────────────────
-- One DO block per table, guarded by to_regclass so missing tables are skipped.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'claude_subscription_usage',
    'anthropic_api_usage',
    'cron_runs',
    'kiwi_dev_runs'
  ];
  has_user_id boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Some telemetry tables may be global (no user_id). If user_id exists, scope
    -- to the owner; otherwise apply a deny-all to anon/authenticated (service
    -- role still bypasses RLS for the server-side writers/readers).
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
    ) INTO has_user_id;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);

    IF has_user_id THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (user_id = auth.uid())',
        t || '_select', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (user_id = auth.uid())',
        t || '_insert', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
        t || '_update', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (user_id = auth.uid())',
        t || '_delete', t);
    ELSE
      -- No user_id column: deny all client access; RLS on + no permissive policy
      -- means anon/authenticated get nothing, service role still bypasses.
      NULL;
    END IF;
  END LOOP;
END
$$;
