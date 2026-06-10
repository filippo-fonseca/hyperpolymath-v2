-- 0027 — privacy gate for the MCP export. Per-row no_export flag on the three
-- surfaces whose content is user-authored prose (captures, tasks, jarvis_facts).
-- Snapshot builder filters rows WHERE no_export = true.
-- Default false: existing rows are exported unless the user explicitly opts out.

ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS no_export boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS no_export boolean NOT NULL DEFAULT false;

ALTER TABLE public.jarvis_facts
  ADD COLUMN IF NOT EXISTS no_export boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS captures_no_export_partial_idx
  ON public.captures (user_id) WHERE no_export = true;
CREATE INDEX IF NOT EXISTS tasks_no_export_partial_idx
  ON public.tasks (user_id) WHERE no_export = true;
CREATE INDEX IF NOT EXISTS jarvis_facts_no_export_partial_idx
  ON public.jarvis_facts (user_id) WHERE no_export = true;
