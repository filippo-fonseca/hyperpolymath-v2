-- 0024 — training: recurring activity series (days-of-week + date range).
-- Adds training_activity_series and a nullable series_id FK on
-- training_activities. Series instances are materialized as real activity
-- rows on createSeries; ON DELETE CASCADE on series_id ensures deleting a
-- series wipes its instances.

-- ── training_activity_series ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_activity_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_type_id uuid NOT NULL REFERENCES public.training_activity_types(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  planned_duration_min integer,
  planned_distance_km numeric(8,3),
  days_of_week boolean[] NOT NULL,
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT training_activity_series_dow_length CHECK (array_length(days_of_week, 1) = 7),
  CONSTRAINT training_activity_series_dow_any CHECK (days_of_week @> ARRAY[true]),
  CONSTRAINT training_activity_series_date_range CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS training_activity_series_user_idx
  ON public.training_activity_series (user_id);

ALTER TABLE public.training_activity_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_activity_series_select" ON public.training_activity_series;
CREATE POLICY "training_activity_series_select"
  ON public.training_activity_series FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "training_activity_series_insert" ON public.training_activity_series;
CREATE POLICY "training_activity_series_insert"
  ON public.training_activity_series FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "training_activity_series_update" ON public.training_activity_series;
CREATE POLICY "training_activity_series_update"
  ON public.training_activity_series FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "training_activity_series_delete" ON public.training_activity_series;
CREATE POLICY "training_activity_series_delete"
  ON public.training_activity_series FOR DELETE
  USING (auth.uid() = user_id);

-- ── add series_id to training_activities ─────────────────────────────────
ALTER TABLE public.training_activities
  ADD COLUMN IF NOT EXISTS series_id uuid
  REFERENCES public.training_activity_series(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS training_activities_series_idx
  ON public.training_activities (series_id)
  WHERE series_id IS NOT NULL;

-- ── realtime publication ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND tablename = 'training_activity_series'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.training_activity_series';
    END IF;
  END IF;
END $$;

-- ── state_version trigger ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS bump_state_version_on_training_activity_series ON public.training_activity_series;
CREATE TRIGGER bump_state_version_on_training_activity_series
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_activity_series
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
