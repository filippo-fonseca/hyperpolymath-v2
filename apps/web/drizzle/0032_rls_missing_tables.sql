-- 0032 — enable RLS on the tables that never had it.
--
-- SECURITY FIX. Nine tables in `public` were created by drizzle migrations
-- WITHOUT `ENABLE ROW LEVEL SECURITY` and without policies, while Supabase's
-- default privileges granted `anon` and `authenticated` SELECT on them. The
-- anon key is public by design: it ships in the client bundle. So every row in
-- these tables was readable by anyone who loaded the site and called PostgREST
-- directly.
--
-- Exposed in production at the time of writing:
--   whatsapp_messages        message bodies, chat names, senders
--   imessage_messages        message bodies, chat names, senders
--   link_previews            fetched URL metadata (43 rows)
--   page_field_definitions   user-defined wiki field schemas
--   page_field_values        user-defined wiki field content
--   tasks_hashtags           task/hashtag joins
--   agentmail_ingest_events  inbound email senders and subjects
--
-- The two message tables were empty when this was found, so no message content
-- had leaked. They would not have stayed empty: the desktop app ships iMessage
-- and WhatsApp sync, and the first sync would have written message bodies into
-- a publicly readable table.
--
-- Two shapes of fix, depending on whether a table has an owner column:
--
--   1. Owner-scoped (has user_id): RLS + four owner-only policies, matching
--      the pattern every other user table in this schema already uses.
--
--   2. Internal (no user_id): RLS enabled with NO policies. That denies anon
--      and authenticated outright. It does not lock out the server: `postgres`
--      (the Drizzle DATABASE_URL role) and `service_role` both carry BYPASSRLS,
--      so every server-side read keeps working. This is deny-by-default, and it
--      is the correct posture for an ingest log or a cron ledger that no
--      browser should ever read.
--
-- The app's own data path is Drizzle as `postgres`, which bypasses RLS, so
-- enabling RLS here changes nothing about how the app reads or writes. It only
-- closes the PostgREST/Realtime door that was standing open.
--
-- Applied by hand, idempotently (journal intentionally stale).

-- ── 1. Owner-scoped tables ────────────────────────────────────────────────

ALTER TABLE "whatsapp_messages"      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "imessage_messages"      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "link_previews"          ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_field_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_field_values"      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tasks_hashtags"         ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "kiwi_dev_runs"          ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'whatsapp_messages',
    'imessage_messages',
    'link_previews',
    'page_field_definitions',
    'page_field_values',
    'tasks_hashtags',
    'kiwi_dev_runs'
  ] LOOP
    -- Skip a table that is absent in this database rather than abort the run:
    -- the two migration dirs have drifted historically and not every database
    -- has every table.
    CONTINUE WHEN to_regclass('public.' || quote_ident(t)) IS NULL;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())',
      t || '_select_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())',
      t || '_insert_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_update_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
      t || '_update_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())',
      t || '_delete_own', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ── 2. Internal tables: RLS on, no policies, deny anon + authenticated ────
-- `postgres` and `service_role` carry BYPASSRLS, so the server still reads
-- these normally. No browser ever should.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agentmail_ingest_events', 'cron_runs'] LOOP
    CONTINUE WHEN to_regclass('public.' || quote_ident(t)) IS NULL;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
