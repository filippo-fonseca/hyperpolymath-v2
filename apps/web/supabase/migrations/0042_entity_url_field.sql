-- 0042 — Notion-style "URL" property on tasks, pages, and captures (issue #101).
--
-- Adds one optional, nullable `url` text column to each of the three primary
-- entities so the user can attach a single canonical link to a task, a wiki
-- page, or a capture (rendered as a clickable link on the entity, editable from
-- its detail/header surface). This is the dedicated property field — distinct
-- from auto-linkified URLs that appear inside capture/page CONTENT.
--
-- The app normalizes the value client-side (prepends https:// when no scheme is
-- present, ignores empty input) before persisting, so the column just stores the
-- final href verbatim. NULL = unset (the default for every existing row — all
-- adds are additive and leave current data untouched).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS url text;

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS url text;

ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS url text;
