-- 0039 - BYOK: per-user third-party API keys (Anthropic / Groq / ElevenLabs).
--
-- Going public, each user supplies their own paid API keys instead of the app
-- using the owner's keys for everyone. Keys are stored as AES-256-GCM ciphertext
-- (app-level encryption via lib/crypto/byok.ts, key in env BYOK_ENC_KEY) in the
-- `key_encrypted` bytea column. Plaintext never touches the DB. `last4` is a
-- non-sensitive fingerprint for the Settings UI. One row per (user, provider).

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  key_encrypted bytea NOT NULL,
  last4 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_api_keys_pk PRIMARY KEY (user_id, provider)
);

-- Owner-scoped RLS (defense-in-depth; the real boundary is the server-side
-- service-role reads/writes which bypass RLS). No client should ever read these
-- rows directly, but if they do they only see their own — and ciphertext only.
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_api_keys_select ON public.user_api_keys;
DROP POLICY IF EXISTS user_api_keys_insert ON public.user_api_keys;
DROP POLICY IF EXISTS user_api_keys_update ON public.user_api_keys;
DROP POLICY IF EXISTS user_api_keys_delete ON public.user_api_keys;

CREATE POLICY user_api_keys_select ON public.user_api_keys
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_api_keys_insert ON public.user_api_keys
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_api_keys_update ON public.user_api_keys
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_api_keys_delete ON public.user_api_keys
  FOR DELETE USING (user_id = auth.uid());
