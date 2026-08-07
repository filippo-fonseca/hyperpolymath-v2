-- 0041 — per-folder colour on the Wiki explorer.
--
-- Folders were all the same neutral card, which made a wide grid hard to scan.
-- The column stores a PALETTE TOKEN name from lib/ui/palette.ts ("sage",
-- "sky", …), never a colour literal: the tint ramp owns the actual values, so
-- a palette re-tune moves every folder with it and dark mode stays legible.
--
-- NULL = no colour chosen (the neutral card, still the default). Idempotent.

ALTER TABLE public.page_folders
  ADD COLUMN IF NOT EXISTS color text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'page_folders_color_check'
  ) THEN
    ALTER TABLE public.page_folders
      ADD CONSTRAINT page_folders_color_check
      CHECK (
        color IS NULL
        OR color IN ('rose', 'peach', 'butter', 'sage', 'mint', 'sky', 'lavender', 'plum')
      );
  END IF;
END $$;
