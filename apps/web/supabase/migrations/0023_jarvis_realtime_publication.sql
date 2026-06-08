-- 0023 — register the JARVIS persistence tables with supabase_realtime.
--
-- Without this, Supabase Realtime doesn't broadcast postgres_changes for
-- jarvis_turns / jarvis_events / jarvis_facts at all. That meant the
-- browser couldn't live-tail desktop-driven voice turns (those land server-
-- side via the desktop bearer path, get persisted to jarvis_turns, and the
-- browser never heard about them outside the in-tab SSE pipe). It also
-- blocked any future cross-tab "two windows open" scenario.
--
-- jarvis_facts was added later than 0006_realtime_publication.sql so it
-- never made it into the original publication either. Folding it in here
-- so /settings/memory edits replicate live to other open tabs.
--
-- RLS still gates broadcasts via the user_id=eq.<uid> filter applied by
-- useTableSubscription — this migration only enables the broadcast pipeline.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'jarvis_turns'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_turns';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'jarvis_events'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_events';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'jarvis_facts'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_facts';
    END IF;
  END IF;
END $$;
