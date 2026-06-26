-- 0040 — BYOK: per-user Anthropic Admin key (issue #150).
--
-- Lets each user supply their OWN Anthropic Admin key so usage/cost features
-- read from the user's own Anthropic account instead of the owner's
-- ANTHROPIC_ADMIN_KEY env var. The key is stored exactly like the existing BYOK
-- keys (migration 0039): AES-256-GCM ciphertext in user_api_keys.key_encrypted,
-- scoped to (user_id, provider), plaintext never touching the DB.
--
-- The `provider` column is free-text (no CHECK/enum), so the new
-- "anthropic_admin" value requires NO schema change — the application-level
-- registry in lib/byok/providers.ts is the source of truth for valid
-- providers, and the existing RLS policies + (user_id, provider) primary key
-- already cover this row. This migration is therefore documentary/idempotent:
-- it asserts the table shape the new provider relies on so history stays
-- self-explaining and `db push` against an already-migrated DB is a no-op.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_api_keys'
  ) THEN
    RAISE EXCEPTION
      'user_api_keys table missing — apply migration 0039 before 0040';
  END IF;
END $$;
