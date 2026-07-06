# Issue #191 recap — Journal entries: opt-in AI/MCP export toggle

**Status:** completed on branch `kiwi/auto/2026-07-05-issue-191`. Not pushed.

## What changed

1. **Migration `apps/web/supabase/migrations/0045_journal_entries_no_export_default_true.sql`**
   - `ALTER COLUMN no_export SET DEFAULT true` on `public.journal_entries`.
   - `UPDATE ... SET no_export = true WHERE no_export = false` so existing rows are treated as opted-out under the new model (no silent data leakage — matches the acceptance note).
   - Only `journal_entries` is flipped; captures / tasks / jarvis_facts keep the migration-0027 opt-out default because they are not "inherently private" in the same way.

2. **`apps/web/lib/db/schema.ts`** — Drizzle default on `journalEntries.noExport` flipped `false → true` to match the DB.

3. **`apps/web/components/journaling/JournalEntryEditor.tsx`**
   - Toggle label renamed **"Exclude from AI export" → "Include in AI export (MCP)"**.
   - Checkbox is now the inverse of `noExport`: `checked={!noExport}`, and `onCheckedChange` writes `noExport = !checked`. Unchecked (default) = excluded.
   - Initial-state default for a fresh entry is `noExport=true`, so the toggle renders unchecked until the user opts in.

4. **`apps/web/tests/journal/actions.test.ts`** — the "fresh entry" test now expects `no_export = true` on insert.

## Enforcement in the MCP export pipeline

Already correct — `apps/web/lib/context/nodes/journal.ts` filters `if (r.noExport) { excluded++; continue; }`. With the new default, unmodified fresh entries are silently excluded. No change needed.

## Commits (on current branch, unpushed)

- `feat(journal): default no_export=true for MCP export privacy` — migration + schema
- `feat(journal): flip export toggle to opt-in "Include in AI export (MCP)"` — UI
- `test(journal): expect no_export default of true after opt-in flip` (`Closes #191`)

## Verification

- `pnpm --filter web exec tsc --noEmit`: no new type errors in touched files. Pre-existing errors in `tests/api-jarvis-tts.test.ts` are unrelated.
- Runtime path check: MCP snapshot builder already respected `noExport`, so once migration 0045 is applied prod journal entries are excluded by default without further code changes.

## Follow-ups for Filippo

- **Apply migration 0045 to remote Supabase** — not applied by the agent (per orchestrator convention). Because it flips a live user's journal entries to opted-out, run it explicitly.
- Consider a `getJournalEntries` filter option so any future UI listing exported-vs-private entries doesn't have to re-derive the semantics client-side. Not needed for #191 acceptance.
