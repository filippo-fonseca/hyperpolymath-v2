-- 0045 — journal_entries privacy default flip (issue #191).
-- Journal entries are inherently private; the MCP export must be opt-IN, not
-- opt-out. This migration:
--   1. Flips the column default on journal_entries.no_export from false → true
--      so newly-inserted rows are excluded from MCP export by default.
--   2. Migrates existing rows: any row currently no_export=false is set to
--      true so the new default is applied retroactively (per the acceptance
--      note: "existing journal entries that were previously un-excluded should
--      be treated as opted-out under the new model — no silent data leakage").
--
-- Only journal_entries is flipped. captures / tasks / jarvis_facts keep the
-- opt-out default from 0027 — they are not "inherently private" in the same way.

ALTER TABLE public.journal_entries
  ALTER COLUMN no_export SET DEFAULT true;
--> statement-breakpoint

UPDATE public.journal_entries
  SET no_export = true
  WHERE no_export = false;
