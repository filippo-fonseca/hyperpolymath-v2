-- 0020 — multi-tenancy readiness: ship the four tables that were defined in
-- lib/db/schema.ts but never landed as Supabase migrations.
--
-- These tables hold per-user secrets (OAuth tokens, desktop bearer hashes) or
-- per-user usage data. Each row already carries user_id; this migration adds
-- the matching owner-only RLS policies so they're safe to expose under the
-- single Supabase project once we open up signups.
--
-- Defense-in-depth note: integration_tokens, desktop_devices, and
-- claude_code_usage are all written/read through server-side code paths
-- already gated by their own auth (Supabase session, validateDesktopBearer,
-- Ed25519-signed sync). RLS here is belt-and-suspenders — it catches the
-- case where a future client-side read path slips through review.

-- ── integration_tokens ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_tokens (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_tokens_select_own" ON public.integration_tokens;
CREATE POLICY "integration_tokens_select_own"
  ON public.integration_tokens FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "integration_tokens_insert_own" ON public.integration_tokens;
CREATE POLICY "integration_tokens_insert_own"
  ON public.integration_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "integration_tokens_update_own" ON public.integration_tokens;
CREATE POLICY "integration_tokens_update_own"
  ON public.integration_tokens FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "integration_tokens_delete_own" ON public.integration_tokens;
CREATE POLICY "integration_tokens_delete_own"
  ON public.integration_tokens FOR DELETE
  USING (user_id = auth.uid());

-- ── flow_sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.flow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS flow_sessions_user_started_uniq
  ON public.flow_sessions (user_id, started_at);
CREATE INDEX IF NOT EXISTS flow_sessions_user_started_idx
  ON public.flow_sessions (user_id, started_at);

ALTER TABLE public.flow_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flow_sessions_select_own" ON public.flow_sessions;
CREATE POLICY "flow_sessions_select_own"
  ON public.flow_sessions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "flow_sessions_insert_own" ON public.flow_sessions;
CREATE POLICY "flow_sessions_insert_own"
  ON public.flow_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "flow_sessions_update_own" ON public.flow_sessions;
CREATE POLICY "flow_sessions_update_own"
  ON public.flow_sessions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "flow_sessions_delete_own" ON public.flow_sessions;
CREATE POLICY "flow_sessions_delete_own"
  ON public.flow_sessions FOR DELETE
  USING (user_id = auth.uid());

-- ── desktop_devices ───────────────────────────────────────────────────────
-- token_hash is the only sensitive column (sha256 of the bearer plaintext).
-- Plaintext is returned exactly once at mint and never persisted.
CREATE TABLE IF NOT EXISTS public.desktop_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS desktop_devices_user_idx
  ON public.desktop_devices (user_id);

ALTER TABLE public.desktop_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desktop_devices_select_own" ON public.desktop_devices;
CREATE POLICY "desktop_devices_select_own"
  ON public.desktop_devices FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "desktop_devices_insert_own" ON public.desktop_devices;
CREATE POLICY "desktop_devices_insert_own"
  ON public.desktop_devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "desktop_devices_update_own" ON public.desktop_devices;
CREATE POLICY "desktop_devices_update_own"
  ON public.desktop_devices FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "desktop_devices_delete_own" ON public.desktop_devices;
CREATE POLICY "desktop_devices_delete_own"
  ON public.desktop_devices FOR DELETE
  USING (user_id = auth.uid());

-- ── claude_code_usage ─────────────────────────────────────────────────────
-- Per-day aggregated Claude Code token usage, synced from the desktop sync
-- endpoint. Composite PK (user_id, date) makes re-syncing the same day an
-- idempotent upsert. RLS is defense-in-depth — the sync endpoint already
-- gates writes via desktop bearer + Ed25519 signature.
CREATE TABLE IF NOT EXISTS public.claude_code_usage (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cache_read_tokens bigint NOT NULL DEFAULT 0,
  cache_creation_tokens bigint NOT NULL DEFAULT 0,
  total_tokens bigint NOT NULL DEFAULT 0,
  cost_usd_micros integer,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE public.claude_code_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claude_code_usage_select_own" ON public.claude_code_usage;
CREATE POLICY "claude_code_usage_select_own"
  ON public.claude_code_usage FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "claude_code_usage_insert_own" ON public.claude_code_usage;
CREATE POLICY "claude_code_usage_insert_own"
  ON public.claude_code_usage FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "claude_code_usage_update_own" ON public.claude_code_usage;
CREATE POLICY "claude_code_usage_update_own"
  ON public.claude_code_usage FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "claude_code_usage_delete_own" ON public.claude_code_usage;
CREATE POLICY "claude_code_usage_delete_own"
  ON public.claude_code_usage FOR DELETE
  USING (user_id = auth.uid());
