-- 0032 — pages.content_json: BlockNote block-document storage.
--
-- The Pages editor moves from a markdown textarea to a Notion-style BlockNote
-- block editor. BlockNote's source of truth is a JSON block document, so we
-- store it here. `content` (text) is retained as a lossy markdown MIRROR,
-- rewritten on every save, so the personal-context MCP export, search, and
-- portability keep reading markdown with no editor dependency.
--
-- Nullable: legacy pages have content_json = NULL and seed their blocks from
-- the existing `content` markdown on first open.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS content_json jsonb;
