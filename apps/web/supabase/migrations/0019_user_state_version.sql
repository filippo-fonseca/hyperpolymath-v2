-- 0019 — users.state_version + bump_user_state_version() function + 6 triggers.
--
-- Phase 11 / CACHE-03 (D-01). Adds a BIGINT freshness counter to users
-- that increments atomically inside the same transaction as any row
-- INSERT/UPDATE/DELETE on the 6 user-state tables JARVIS depends on:
--   tasks, captures, projects, areas, habits, jarvis_facts.
--
-- The /api/jarvis route boundary reads this counter once per turn (inside
-- the existing Phase 10 LAT-04 Promise.all) and treats it as the cache
-- key for the in-memory user-state snapshot. When unchanged since the
-- previous turn, the snapshot string is reused byte-for-byte → Anthropic
-- cache hit on the 5-min snapshot tier.
--
-- Tamper-proof: any future tool that writes via Drizzle (or psql, or
-- supabase-js, or supabase-cli) bumps the version automatically. No
-- application-layer discipline required.
--
-- BIGINT chosen for headroom: 9.2 quintillion bumps. At 1 CRUD/sec for
-- 100 years = 3.15 billion. No wraparound concern.
--
-- Idempotent: IF NOT EXISTS on column, CREATE OR REPLACE on function,
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER on every trigger.

-- 1. Column.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 1;

-- 2. Function.
CREATE OR REPLACE FUNCTION public.bump_user_state_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- INSERT/UPDATE expose NEW; DELETE exposes OLD.
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  -- Defensive guard: NULL user_id is not expected on any of the 6
  -- target tables (all carry NOT NULL user_id columns), but if a future
  -- migration relaxes that constraint we silently skip the bump rather
  -- than erroring out and rolling back the original mutation.
  IF v_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Atomic bump inside the same transaction as the triggering write.
  UPDATE public.users
    SET state_version = state_version + 1
    WHERE id = v_user_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 3. Triggers — one per user-state table.

DROP TRIGGER IF EXISTS bump_state_version_on_tasks ON public.tasks;
CREATE TRIGGER bump_state_version_on_tasks
  BEFORE INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_captures ON public.captures;
CREATE TRIGGER bump_state_version_on_captures
  BEFORE INSERT OR UPDATE OR DELETE ON public.captures
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_projects ON public.projects;
CREATE TRIGGER bump_state_version_on_projects
  BEFORE INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_areas ON public.areas;
CREATE TRIGGER bump_state_version_on_areas
  BEFORE INSERT OR UPDATE OR DELETE ON public.areas
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_habits ON public.habits;
CREATE TRIGGER bump_state_version_on_habits
  BEFORE INSERT OR UPDATE OR DELETE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_jarvis_facts ON public.jarvis_facts;
CREATE TRIGGER bump_state_version_on_jarvis_facts
  BEFORE INSERT OR UPDATE OR DELETE ON public.jarvis_facts
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
