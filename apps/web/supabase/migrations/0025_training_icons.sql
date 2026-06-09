-- 0025 — training: optional icon column on activity types.
-- Stores the lucide-react icon name (e.g. "dumbbell"). Null = no icon
-- (fall back to color swatch only).

ALTER TABLE public.training_activity_types
  ADD COLUMN IF NOT EXISTS icon text;
