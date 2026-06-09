-- 0022 — training: three tables + RLS + Realtime publication + state_version triggers.
--
-- Phase 15 — fitness activity planner. Mirrors the habits pattern end-to-end:
--   * Three userId-scoped tables (training_batches, training_activity_types,
--     training_activities) with the standard owner-only RLS quartet.
--   * All three added to the supabase_realtime publication so
--     useTableSubscription drives invalidation in TanStack Query.
--   * All three attached to the existing public.bump_user_state_version()
--     function (introduced in migration 0019) so JARVIS's state-snapshot
--     cache invalidates on any training write — even though no JARVIS
--     training tools ship in Phase 15, the trigger is cheap to add now
--     (D-19 / CACHE-03).
--
-- Also adds users.distance_unit (default 'km') with a CHECK constraint
-- enforcing the 'km' | 'mi' enum at the storage layer (D-10 / TRN-14).
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS everywhere. The CHECK constraint
-- on users.distance_unit is wrapped in a DO block that swallows the
-- duplicate_object exception so reruns are safe.
--
-- Numeric precision for distance columns is (8,3) — 99999.999 km max with
-- millimeter precision, far beyond any human single-activity distance.
-- Storage is canonical km; display layer converts per users.distance_unit.

-- ── users.distance_unit ──────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS distance_unit text NOT NULL DEFAULT 'km';

DO $$
BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_distance_unit_check
    CHECK (distance_unit IN ('km', 'mi'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ── training_batches ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_batches_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS training_batches_user_order_idx
  ON public.training_batches (user_id, order_index);

ALTER TABLE public.training_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_batches_select" ON public.training_batches;
CREATE POLICY "training_batches_select"
  ON public.training_batches FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "training_batches_insert" ON public.training_batches;
CREATE POLICY "training_batches_insert"
  ON public.training_batches FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_batches_update" ON public.training_batches;
CREATE POLICY "training_batches_update"
  ON public.training_batches FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_batches_delete" ON public.training_batches;
CREATE POLICY "training_batches_delete"
  ON public.training_batches FOR DELETE
  USING (user_id = auth.uid());

-- ── training_activity_types ──────────────────────────────────────────────
-- batch_id is nullable (ungrouped types allowed, D-06) and uses
-- ON DELETE SET NULL so removing a batch turns its types into ungrouped
-- ones rather than cascade-deleting them.
CREATE TABLE IF NOT EXISTS public.training_activity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.training_batches(id) ON DELETE SET NULL,
  name text NOT NULL,
  color text NOT NULL,
  has_distance boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_activity_types_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS training_activity_types_user_idx
  ON public.training_activity_types (user_id);

-- Partial: order_index only matters for batched types (ungrouped renders
-- in a separate list).
CREATE INDEX IF NOT EXISTS training_activity_types_batch_order_idx
  ON public.training_activity_types (batch_id, order_index)
  WHERE batch_id IS NOT NULL;

ALTER TABLE public.training_activity_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_activity_types_select" ON public.training_activity_types;
CREATE POLICY "training_activity_types_select"
  ON public.training_activity_types FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "training_activity_types_insert" ON public.training_activity_types;
CREATE POLICY "training_activity_types_insert"
  ON public.training_activity_types FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_activity_types_update" ON public.training_activity_types;
CREATE POLICY "training_activity_types_update"
  ON public.training_activity_types FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_activity_types_delete" ON public.training_activity_types;
CREATE POLICY "training_activity_types_delete"
  ON public.training_activity_types FOR DELETE
  USING (user_id = auth.uid());

-- ── training_activities ──────────────────────────────────────────────────
-- ON DELETE RESTRICT on activity_type_id: deleting a type that still has
-- activities should fail loudly so the UI surfaces "archive instead?"
-- (mirrors areas → projects).
--
-- scheduled_date is DATE (not timestamptz): the client decides which ISO
-- date a planned activity belongs to in the user's local timezone — no
-- server-side TZ math (mirrors habit_completions, Pitfall 7 in 15-RESEARCH).
CREATE TABLE IF NOT EXISTS public.training_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_type_id uuid NOT NULL REFERENCES public.training_activity_types(id) ON DELETE RESTRICT,
  scheduled_date date NOT NULL,
  title text NOT NULL,
  description text,
  planned_duration_min integer,
  actual_duration_min integer,
  planned_distance_km numeric(8,3),
  actual_distance_km numeric(8,3),
  status text NOT NULL DEFAULT 'planned',
  day_order_index integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_activities_status_check
    CHECK (status IN ('planned', 'done', 'cancelled', 'skipped')),
  CONSTRAINT training_activities_title_not_blank CHECK (length(btrim(title)) > 0)
);

-- Week / heatmap range scans.
CREATE INDEX IF NOT EXISTS training_activities_user_date_idx
  ON public.training_activities (user_id, scheduled_date);

-- Per-type aggregates on the stats surface.
CREATE INDEX IF NOT EXISTS training_activities_user_type_idx
  ON public.training_activities (user_id, activity_type_id);

-- Partial: completed-only adherence queries. Keeps the index tiny relative
-- to the planned-row volume.
CREATE INDEX IF NOT EXISTS training_activities_user_status_idx
  ON public.training_activities (user_id, status)
  WHERE status = 'done';

ALTER TABLE public.training_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_activities_select" ON public.training_activities;
CREATE POLICY "training_activities_select"
  ON public.training_activities FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "training_activities_insert" ON public.training_activities;
CREATE POLICY "training_activities_insert"
  ON public.training_activities FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_activities_update" ON public.training_activities;
CREATE POLICY "training_activities_update"
  ON public.training_activities FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_activities_delete" ON public.training_activities;
CREATE POLICY "training_activities_delete"
  ON public.training_activities FOR DELETE
  USING (user_id = auth.uid());

-- ── Realtime publication ─────────────────────────────────────────────────
-- Match the pattern used in 0015_habits.sql so optimistic + Realtime echo
-- round-trips work identically.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.training_batches';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.training_activity_types';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.training_activities';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- ── state_version triggers (D-19) ────────────────────────────────────────
-- public.bump_user_state_version() was created in migration 0019. Attaching
-- three more BEFORE triggers here means future JARVIS training tools get
-- automatic snapshot-cache invalidation with zero application-layer effort.

DROP TRIGGER IF EXISTS bump_state_version_on_training_batches ON public.training_batches;
CREATE TRIGGER bump_state_version_on_training_batches
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_batches
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_training_activity_types ON public.training_activity_types;
CREATE TRIGGER bump_state_version_on_training_activity_types
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_activity_types
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_training_activities ON public.training_activities;
CREATE TRIGGER bump_state_version_on_training_activities
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_activities
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
