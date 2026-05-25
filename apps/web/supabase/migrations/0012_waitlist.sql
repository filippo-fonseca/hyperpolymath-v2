-- Phase 8 (D-12 / LAND-WAITLIST). Anonymous email capture from the public landing.
-- FIRST table breaking the user_id-scoped RLS pattern.
--
-- SECURITY MODEL (load-bearing — see 08-RESEARCH.md §Pitfall 5):
--   - Drizzle/postgres pooler connects as DB-owner role → BYPASSES RLS entirely.
--   - These policies are DEFENSE-IN-DEPTH for the unlikely case someone calls
--     the waitlist table via supabase-js from a browser client.
--   - Real security lives in apps/web/app/actions/waitlist.ts:
--       * Zod validation (bounded email, bounded note, honeypot field)
--       * Per-IP rate limit (5 submits / hour, in-memory Map)
--       * ON CONFLICT (email) DO NOTHING (idempotent — no leakage)
--
-- READS: No SELECT policy = no rows visible to anon OR authenticated client paths.
-- Admin reads happen via psql / Supabase Studio with service role.

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- INSERT: open to anon (unauthenticated browser supabase-js calls hit this).
-- WITH CHECK (true) — input validation is in the Server Action layer, not SQL.
CREATE POLICY "waitlist_anon_insert" ON public.waitlist
  FOR INSERT TO anon
  WITH CHECK (true);

-- INSERT: also open to authenticated (Filippo logged in could submit; harmless).
CREATE POLICY "waitlist_authenticated_insert" ON public.waitlist
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Intentionally NO SELECT/UPDATE/DELETE policies. Admin operations via service role only.
