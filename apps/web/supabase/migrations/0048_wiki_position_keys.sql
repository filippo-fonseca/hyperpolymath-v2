-- 0048 — Wiki Renaissance: fractional position keys for manual ordering.
--
-- Adds a nullable `position_key text` to public.pages AND public.page_folders.
-- It holds a base-62 fractional index (see apps/web/lib/pages/position.ts) that
-- drives manual drag-to-reorder in the Explorer. Sort order is
-- (position_key NULLS LAST, name): legacy rows with NULL position_key trail the
-- manually-ordered ones and fall back to name order until the first reorder
-- lazily seeds keys for that parent's siblings. This standardizes ordering on a
-- single string key for both tables; page_folders.order_index stays untouched
-- (unused, left in place to avoid a destructive drop).
--
-- Partial indexes cover the per-parent sibling scan the reorder/seed path runs:
-- pages by (user_id, folder_id, position_key) and folders by
-- (user_id, parent_id, position_key), only for rows that already carry a key.
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS);
-- existing rows get NULL and are otherwise untouched.
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS position_key text;
--> statement-breakpoint
ALTER TABLE public.page_folders ADD COLUMN IF NOT EXISTS position_key text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pages_user_folder_position_idx
  ON public.pages (user_id, folder_id, position_key)
  WHERE position_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS page_folders_user_parent_position_idx
  ON public.page_folders (user_id, parent_id, position_key)
  WHERE position_key IS NOT NULL;
