-- 0029 — nutrition: five tables + meal_slot enum + RLS + Realtime publication + state_version triggers.
--
-- Phase 17 — nutrition tracking tab. Mirrors the training pattern end-to-end:
--   * Five userId-scoped tables (foods, food_serving_options, food_logs, meals,
--     meal_items, nutrition_targets) with the standard owner-only RLS quartet.
--   * foods, food_serving_options, food_logs, meals, meal_items added to
--     supabase_realtime publication. nutrition_targets is excluded (changes
--     rarely, no live-UI dependency).
--   * food_logs and meals attached to the existing public.bump_user_state_version()
--     function (introduced in migration 0019) so JARVIS's state-snapshot cache
--     invalidates on nutrition writes (D-14 / CACHE-03 extension).
--
-- Key design decisions:
--   * food_logs carries snapshotted macros (kcal, protein_g, carbs_g, fat_g)
--     immutable to future food edits (RESEARCH Pitfall 1 — "snapshot at log time")
--   * food_logs.food_id uses ON DELETE RESTRICT to prevent deleting a food that
--     has log history (analogous to areas → projects restrict)
--   * food_serving_options and meal_items denormalize user_id for RLS (pattern
--     from tasks_projects / captures_projects)
--   * nutrition_targets PK = user_id (one row per user, upserted on save)
--   * CHECK constraint on nutrition_targets: abs((protein_pct + carbs_pct + fat_pct) - 100) < 0.5
--     (numeric scale tolerance; strict validation enforced in app Zod schema)
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS everywhere. Realtime ADD TABLE
-- is wrapped in EXCEPTION WHEN duplicate_object so reruns are safe.

-- ── meal_slot enum ───────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE public.meal_slot AS ENUM ('breakfast', 'lunch', 'dinner', 'snacks');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ── foods ────────────────────────────────────────────────────────────────────
-- Canonical food registry. Can be sourced from Open Food Facts (OFF) via
-- barcode or created manually. Per-100g macros are the canonical source of
-- truth (D-04); quantities are multiplied at log time.
CREATE TABLE IF NOT EXISTS public.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- OFF barcode; null for manual entries and generic foods
  off_barcode text,
  name text NOT NULL,
  brand text,
  -- Per-100g macros
  kcal_per_100g numeric(8,2) NOT NULL,
  protein_per_100g numeric(8,2) NOT NULL,
  carbs_per_100g numeric(8,2) NOT NULL,
  fat_per_100g numeric(8,2) NOT NULL,
  -- Optional secondary macros (store if present in OFF data)
  fiber_per_100g numeric(8,2),
  sodium_per_100g numeric(8,2),  -- grams (÷1000 to display mg)
  -- Base unit: "g" | "ml"
  base_unit text NOT NULL DEFAULT 'g',
  -- Manual = no OFF barcode
  is_manual boolean NOT NULL DEFAULT false,
  -- Usage tracking for personal-history sort ordering (D-02)
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS foods_user_last_used_idx
  ON public.foods (user_id, last_used_at DESC);

-- Unique barcode per user where barcode is not null (OFF foods can be
-- shared across users' registries without collision).
CREATE UNIQUE INDEX IF NOT EXISTS foods_user_barcode_uniq
  ON public.foods (user_id, off_barcode)
  WHERE off_barcode IS NOT NULL;

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "foods_select" ON public.foods;
CREATE POLICY "foods_select"
  ON public.foods FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "foods_insert" ON public.foods;
CREATE POLICY "foods_insert"
  ON public.foods FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "foods_update" ON public.foods;
CREATE POLICY "foods_update"
  ON public.foods FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "foods_delete" ON public.foods;
CREATE POLICY "foods_delete"
  ON public.foods FOR DELETE
  USING (user_id = auth.uid());

-- ── food_serving_options ─────────────────────────────────────────────────────
-- Per-food selectable serving units (e.g., "1 cup", "1 slice", "100 g").
-- user_id is denormalized for RLS (same pattern as tasks_projects / captures_projects).
-- Every food automatically gets a "100 g" default serving option seeded on create
-- (D-05/D-06 — simplest model covering both manual entry and OFF products).
CREATE TABLE IF NOT EXISTS public.food_serving_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id uuid NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- denormalized for RLS
  label text NOT NULL,    -- e.g., "1 cup", "1 slice", "100 g", "1 medium"
  grams_or_ml numeric(8,2) NOT NULL,  -- base-unit equivalent for macro calculation
  is_default boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS food_serving_options_food_idx
  ON public.food_serving_options (food_id);

CREATE INDEX IF NOT EXISTS food_serving_options_user_idx
  ON public.food_serving_options (user_id);

ALTER TABLE public.food_serving_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_serving_options_select" ON public.food_serving_options;
CREATE POLICY "food_serving_options_select"
  ON public.food_serving_options FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "food_serving_options_insert" ON public.food_serving_options;
CREATE POLICY "food_serving_options_insert"
  ON public.food_serving_options FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "food_serving_options_update" ON public.food_serving_options;
CREATE POLICY "food_serving_options_update"
  ON public.food_serving_options FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "food_serving_options_delete" ON public.food_serving_options;
CREATE POLICY "food_serving_options_delete"
  ON public.food_serving_options FOR DELETE
  USING (user_id = auth.uid());

-- ── food_logs ────────────────────────────────────────────────────────────────
-- Per-day per-meal-slot log entries. Macros are SNAPSHOTTED at log time —
-- they are NOT computed at read time from foods.kcal_per_100g. This means
-- future edits to a food's nutrition data do not silently corrupt historical
-- logs (RESEARCH Pitfall 1 — "snapshot at log time").
--
-- food_id uses ON DELETE RESTRICT: deleting a food that still has log entries
-- must fail loudly so the UI can surface "there are X log entries using this
-- food — archive or reassign first?" (mirrors areas → projects restrict).
CREATE TABLE IF NOT EXISTS public.food_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,  -- ISO date "YYYY-MM-DD" (client timezone, not server)
  meal_slot public.meal_slot NOT NULL,
  food_id uuid NOT NULL REFERENCES public.foods(id) ON DELETE RESTRICT,
  serving_option_id uuid REFERENCES public.food_serving_options(id) ON DELETE SET NULL,
  quantity numeric(8,2) NOT NULL,  -- multiplier of the serving unit
  -- Snapshotted macros at log time (KEY PATTERN — immutable to future food edits)
  kcal integer NOT NULL,
  protein_g numeric(8,2) NOT NULL,
  carbs_g numeric(8,2) NOT NULL,
  fat_g numeric(8,2) NOT NULL,
  fiber_g numeric(8,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_logs_user_date_idx
  ON public.food_logs (user_id, log_date);

CREATE INDEX IF NOT EXISTS food_logs_user_date_slot_idx
  ON public.food_logs (user_id, log_date, meal_slot);

ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_logs_select" ON public.food_logs;
CREATE POLICY "food_logs_select"
  ON public.food_logs FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "food_logs_insert" ON public.food_logs;
CREATE POLICY "food_logs_insert"
  ON public.food_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "food_logs_update" ON public.food_logs;
CREATE POLICY "food_logs_update"
  ON public.food_logs FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "food_logs_delete" ON public.food_logs;
CREATE POLICY "food_logs_delete"
  ON public.food_logs FOR DELETE
  USING (user_id = auth.uid());

-- ── meals ────────────────────────────────────────────────────────────────────
-- Saved reusable meal groupings (e.g., "My Breakfast Bowl"). Logging a saved
-- meal expands all its meal_items into individual food_logs rows with snapshotted
-- macros computed at log time.
CREATE TABLE IF NOT EXISTS public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meals_user_last_used_idx
  ON public.meals (user_id, last_used_at DESC);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meals_select" ON public.meals;
CREATE POLICY "meals_select"
  ON public.meals FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "meals_insert" ON public.meals;
CREATE POLICY "meals_insert"
  ON public.meals FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "meals_update" ON public.meals;
CREATE POLICY "meals_update"
  ON public.meals FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "meals_delete" ON public.meals;
CREATE POLICY "meals_delete"
  ON public.meals FOR DELETE
  USING (user_id = auth.uid());

-- ── meal_items ───────────────────────────────────────────────────────────────
-- Foods + servings inside a saved meal. user_id is denormalized for RLS.
-- food_id uses ON DELETE RESTRICT — cannot delete a food that is part of a
-- saved meal (prevents silent corruption of saved meal macro totals).
CREATE TABLE IF NOT EXISTS public.meal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- denormalized for RLS
  food_id uuid NOT NULL REFERENCES public.foods(id) ON DELETE RESTRICT,
  serving_option_id uuid REFERENCES public.food_serving_options(id) ON DELETE SET NULL,
  quantity numeric(8,2) NOT NULL,
  order_index integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS meal_items_meal_idx
  ON public.meal_items (meal_id);

CREATE INDEX IF NOT EXISTS meal_items_user_idx
  ON public.meal_items (user_id);

ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meal_items_select" ON public.meal_items;
CREATE POLICY "meal_items_select"
  ON public.meal_items FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "meal_items_insert" ON public.meal_items;
CREATE POLICY "meal_items_insert"
  ON public.meal_items FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "meal_items_update" ON public.meal_items;
CREATE POLICY "meal_items_update"
  ON public.meal_items FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "meal_items_delete" ON public.meal_items;
CREATE POLICY "meal_items_delete"
  ON public.meal_items FOR DELETE
  USING (user_id = auth.uid());

-- ── nutrition_targets ────────────────────────────────────────────────────────
-- One row per user — upserted on save (ON CONFLICT (user_id) DO UPDATE).
-- PK = user_id so SELECT policy is trivially (user_id = auth.uid()).
-- Macro percentages must sum to 100 (tolerance: ±0.5 for numeric scale rounding;
-- strict 100 is enforced in application Zod schema via .refine()).
CREATE TABLE IF NOT EXISTS public.nutrition_targets (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  target_kcal integer NOT NULL DEFAULT 2000,
  protein_pct numeric(5,2) NOT NULL DEFAULT 30,  -- % of total calories
  carbs_pct numeric(5,2) NOT NULL DEFAULT 40,
  fat_pct numeric(5,2) NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_targets_pct_sum
    CHECK (abs((protein_pct + carbs_pct + fat_pct) - 100) < 0.5)
);

ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutrition_targets_select" ON public.nutrition_targets;
CREATE POLICY "nutrition_targets_select"
  ON public.nutrition_targets FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "nutrition_targets_insert" ON public.nutrition_targets;
CREATE POLICY "nutrition_targets_insert"
  ON public.nutrition_targets FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nutrition_targets_update" ON public.nutrition_targets;
CREATE POLICY "nutrition_targets_update"
  ON public.nutrition_targets FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nutrition_targets_delete" ON public.nutrition_targets;
CREATE POLICY "nutrition_targets_delete"
  ON public.nutrition_targets FOR DELETE
  USING (user_id = auth.uid());

-- ── Realtime publication ─────────────────────────────────────────────────────
-- nutrition_targets is intentionally excluded — it changes rarely and
-- broadcasting target changes has no live-UI dependency in Phase 17.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.foods';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.food_serving_options';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.food_logs';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meals';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_items';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- ── state_version triggers (D-14 / CACHE-03 extension) ───────────────────────
-- public.bump_user_state_version() was created in migration 0019. Wiring
-- food_logs and meals here means future JARVIS nutrition tools get automatic
-- snapshot-cache invalidation with zero application-layer effort. meal_items
-- and foods are excluded — those change during setup, not during a JARVIS
-- session, so the state-snapshot cache does not need to invalidate on them.

DROP TRIGGER IF EXISTS bump_state_version_on_food_logs ON public.food_logs;
CREATE TRIGGER bump_state_version_on_food_logs
  BEFORE INSERT OR UPDATE OR DELETE ON public.food_logs
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_meals ON public.meals;
CREATE TRIGGER bump_state_version_on_meals
  BEFORE INSERT OR UPDATE OR DELETE ON public.meals
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
