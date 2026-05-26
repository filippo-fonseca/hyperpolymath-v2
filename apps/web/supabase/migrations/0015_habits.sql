-- 0015 — habits, habits_areas (M:N), habit_completions.
--
-- Habits sit at the same hierarchy level as Projects (under Areas), but unlike
-- Projects they can belong to MANY areas (a "Run 5K" habit might link to both
-- Health and Athletics). That M:N relation lives in habits_areas.
--
-- days_of_week stores the weekly schedule as a 7-element boolean array,
-- indexed Sunday=0 through Saturday=6 (matches JavaScript Date.getDay()).
-- We considered a packed bitmap integer but a boolean[] is human-readable in
-- psql / Supabase Studio, which matters for a single-user life-OS where the
-- author is also the operator.
--
-- habit_completions records one row per (habit, day) the user checked off.
-- UNIQUE on (habit_id, completed_date) prevents double-counting from
-- accidental double-taps. completed_date is a DATE (not timestamptz) so the
-- "did I do this on Tuesday" question is answerable in the user's local
-- timezone without server-side TZ math — the client decides which date a
-- check belongs to.

-- ── habits ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text,
  days_of_week boolean[] NOT NULL DEFAULT ARRAY[true,true,true,true,true,true,true]::boolean[],
  order_index integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT habits_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT habits_days_of_week_len CHECK (cardinality(days_of_week) = 7)
);

CREATE INDEX IF NOT EXISTS habits_user_idx
  ON public.habits (user_id, order_index);
CREATE INDEX IF NOT EXISTS habits_user_active_idx
  ON public.habits (user_id) WHERE archived_at IS NULL;

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habits_select_own" ON public.habits;
CREATE POLICY "habits_select_own"
  ON public.habits FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "habits_insert_own" ON public.habits;
CREATE POLICY "habits_insert_own"
  ON public.habits FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "habits_update_own" ON public.habits;
CREATE POLICY "habits_update_own"
  ON public.habits FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "habits_delete_own" ON public.habits;
CREATE POLICY "habits_delete_own"
  ON public.habits FOR DELETE
  USING (user_id = auth.uid());

-- ── habits_areas (M:N) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.habits_areas (
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (habit_id, area_id)
);

CREATE INDEX IF NOT EXISTS habits_areas_area_idx
  ON public.habits_areas (area_id);
CREATE INDEX IF NOT EXISTS habits_areas_user_idx
  ON public.habits_areas (user_id);

ALTER TABLE public.habits_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habits_areas_select_own" ON public.habits_areas;
CREATE POLICY "habits_areas_select_own"
  ON public.habits_areas FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "habits_areas_insert_own" ON public.habits_areas;
CREATE POLICY "habits_areas_insert_own"
  ON public.habits_areas FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "habits_areas_delete_own" ON public.habits_areas;
CREATE POLICY "habits_areas_delete_own"
  ON public.habits_areas FOR DELETE
  USING (user_id = auth.uid());

-- ── habit_completions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.habit_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  completed_date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, completed_date)
);

CREATE INDEX IF NOT EXISTS habit_completions_habit_date_idx
  ON public.habit_completions (habit_id, completed_date DESC);
CREATE INDEX IF NOT EXISTS habit_completions_user_date_idx
  ON public.habit_completions (user_id, completed_date DESC);

ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habit_completions_select_own" ON public.habit_completions;
CREATE POLICY "habit_completions_select_own"
  ON public.habit_completions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "habit_completions_insert_own" ON public.habit_completions;
CREATE POLICY "habit_completions_insert_own"
  ON public.habit_completions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "habit_completions_delete_own" ON public.habit_completions;
CREATE POLICY "habit_completions_delete_own"
  ON public.habit_completions FOR DELETE
  USING (user_id = auth.uid());

-- ── Realtime publication ──────────────────────────────────────────────────
-- Match the pattern used for tasks / captures / projects so the optimistic +
-- Realtime echo round-trip works the same way for habits everywhere.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.habits';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.habits_areas';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.habit_completions';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;
