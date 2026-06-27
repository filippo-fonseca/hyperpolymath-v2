-- 0042 — pages: Notion-style cover/banner image (issue #28).
--
-- Adds two nullable text columns to public.pages:
--   * cover_image_url        — the chosen banner image. Either an Unsplash
--                              `images.unsplash.com` URL picked from the search
--                              grid, or any direct image URL the user pastes.
--                              NULL = no banner.
--   * cover_image_attribution — the Unsplash photographer credit
--                              ("Name on Unsplash") when the cover came from the
--                              Unsplash picker, so the required attribution can
--                              render over the banner. NULL for plain image-URL
--                              covers (and for all pre-existing pages).
--
-- Both are additive and NULLABLE with no default, so every existing page row is
-- untouched (no banner until the user sets one). No RLS / realtime / trigger
-- changes are needed: the pages owner-only RLS quartet, the supabase_realtime
-- publication, and the bump_user_state_version() trigger from migration 0031 all
-- already cover the pages table, and these columns ride along with the existing
-- page UPDATE path.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so reruns are safe.

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS cover_image_url text;

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS cover_image_attribution text;
