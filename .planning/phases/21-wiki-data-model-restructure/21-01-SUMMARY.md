---
phase: 21-wiki-data-model-restructure
plan: 01
subsystem: database
tags: [postgres, drizzle, supabase, rls, realtime, migration, self-fk, junction-table]

requires:
  - phase: 20-journaling-daily-entries-prompt-notes-graph-mcp
    provides: pages / pages_projects / page_folders wiki tables + 0033 page_folders migration
provides:
  - "Migration 0034: page_folders.parent_id self-FK (ON DELETE CASCADE) + no_self_parent CHECK"
  - "folder_projects M:N junction (folder_id, project_id, user_id) with owner-only RLS quartet"
  - "pages.folder_id direct placement column (ON DELETE SET NULL)"
  - "Backfill of existing folder->project links into folder_projects before dropping page_folders.project_id"
  - "folder_projects wired to supabase_realtime + bump_user_state_version trigger"
  - "Drizzle schema mirror of all the above; folder_projects added to RealtimeTable union"
affects: [21-02, 23-wiki-tree-ui, 24-wiki-linking-ux]

tech-stack:
  added: []
  patterns:
    - "Self-referencing FK in Drizzle via .references((): AnyPgColumn => table.id)"
    - "Idempotent hand-written migration: guarded DO-blocks + dynamic EXECUTE for the backfill"

key-files:
  created:
    - apps/web/supabase/migrations/0034_wiki_data_model_restructure.sql
  modified:
    - apps/web/lib/db/schema.ts
    - apps/web/lib/realtime/query-keys.ts

key-decisions:
  - "Backfill (step 7) wrapped in an information_schema column-existence guard + dynamic EXECUTE so a full re-run after project_id is dropped (step 10) parses and no-ops instead of erroring"
  - "Applied to the LOCAL Docker Supabase only; remote/prod apply deferred (OUTSTANDING)"

patterns-established:
  - "AnyPgColumn type annotation breaks the implicit-any cycle on a self-FK thunk"
  - "M:N junction mirrors pages_projects: denormalized user_id for RLS, ON DELETE CASCADE on both FKs, UNIQUE(folder_id, project_id)"

requirements-completed: [WIKI-MODEL-01, WIKI-MODEL-02, WIKI-MODEL-03]

duration: ~40min
completed: 2026-06-21
---

# Phase 21 (Plan 01): Wiki Data-Model Restructure — Schema + Migration Summary

**Folders are now decoupled from projects: a nullable parent_id self-FK gives arbitrary-depth nesting and a folder_projects M:N junction (with the standard owner-only RLS quartet) replaces the old required folder->project link, with existing links backfilled before the old column is dropped.**

## Accomplishments
- Hand-wrote and applied (to local Docker Supabase) `0034_wiki_data_model_restructure.sql`: 10 ordered, idempotent steps. The backfill INSERT (step 7) runs before the `page_folders.project_id` DROP (step 10) so no link data is lost.
- Added `page_folders.parent_id` (self-FK, ON DELETE CASCADE) + `no_self_parent CHECK (id <> parent_id)`; created the `folder_projects` junction with its RLS quartet, Realtime registration, and `bump_user_state_version` trigger; added `pages.folder_id` (ON DELETE SET NULL) and dropped the now-redundant `pages_projects.folder_id` + `page_folders.project_id`.
- Mirrored the whole change in Drizzle `schema.ts` and added `folder_projects` to the `RealtimeTable` union.

## Task Commits
1. **Migration 0034** - `95d02d3` (feat)
2. **Drizzle schema mirror + Realtime registration** - `dac6841` (feat)

## Issues Encountered
- Stale worktree branch (11 commits behind, missing dependency files) — resolved with `git merge --ff-only`, zero commits lost.
- Migration idempotency bug (re-run referenced the dropped `project_id`) — fixed by wrapping the backfill in an `information_schema` column-existence guard + dynamic EXECUTE.
- Drizzle self-FK implicit-any cycle — fixed with the `AnyPgColumn` return-type annotation.

## User Setup Required
**OUTSTANDING — remote/prod migration apply.** `0034` is applied to the LOCAL Docker Supabase only. Before the wiki ships to prod, apply `apps/web/supabase/migrations/0034_wiki_data_model_restructure.sql` to the remote Supabase project. The migration is idempotent, but verify the backfill landed (existing folders get folder_projects rows) before relying on the new model.

## Next Phase Readiness
Schema + types are in place for plan 21-02 (query/action/UI rewrite). The migration is safe to re-run.

---
*Phase: 21-wiki-data-model-restructure*
*Completed: 2026-06-21*
