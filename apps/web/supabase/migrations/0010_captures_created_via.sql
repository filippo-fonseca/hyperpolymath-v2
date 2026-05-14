-- Phase 5 Plan 05-02 — captures.created_via additive column (D-14).
--
-- Additive nullable text. Existing rows stay NULL. JARVIS-created
-- captures will write 'jarvis' (executor.ts in this plan). Plan 05-04
-- wires the "Convert to task" affordance keying off this column —
-- JARVIS-13.
--
-- Additive: no destructive ALTERs, no NOT NULL constraint (existing rows
-- would break under a non-null default).

ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS created_via text;

CREATE INDEX IF NOT EXISTS captures_created_via_idx
  ON public.captures (created_via)
  WHERE created_via IS NOT NULL;
