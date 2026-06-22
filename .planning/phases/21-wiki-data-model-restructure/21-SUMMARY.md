---
phase: 21-wiki-data-model-restructure
subsystem: database
tags: [postgres, drizzle, supabase, rls, realtime, server-actions, tree, vitest]
requirements-completed: [WIKI-MODEL-01, WIKI-MODEL-02, WIKI-MODEL-03, WIKI-MODEL-04, WIKI-MODEL-05, WIKI-MODEL-06, WIKI-MODEL-07]
completed: 2026-06-21
---

# Phase 21: Wiki Data-Model Restructure — Phase Summary

**Wiki folders are decoupled from projects: they nest arbitrarily deep via a parent_id self-FK, link to zero-or-more projects through a folder_projects M:N junction (owner-only RLS), and pages now sit in one folder globally — with the full query/action/UI layer rewritten to compute each node's effective project set (own ∪ inherited) and a cross-user RLS test proving isolation.**

Both waves complete. See `21-01-SUMMARY.md` (schema + migration) and `21-02-SUMMARY.md` (query/action/UI) for detail.

## What shipped
- **Schema (21-01):** migration `0034`, applied to LOCAL Supabase. `page_folders.parent_id` self-FK + `no_self_parent` CHECK; `folder_projects` junction + RLS quartet + Realtime + state-version trigger; `pages.folder_id` direct placement; existing links backfilled before `page_folders.project_id` dropped. Mirrored in Drizzle; `folder_projects` added to the Realtime union.
- **Query/action/UI (21-02):** project-independent folder/page queries with an in-TS ancestor walk for effective project sets; `buildPagesTree` rewritten to a `{ roots, standalonePages }` parent_id hierarchy with `isInherited`/`sourceFolder` flags; Server Actions with an app-layer reparent cycle guard, `setFolderProjects`, and page-level `setPageFolder`; both folder-tree components subscribe to `folder_projects` Realtime; cross-user RLS test (3/3 passing).

## Commits
1. `95d02d3` feat — migration 0034
2. `dac6841` feat — Drizzle schema mirror + Realtime registration
3. `8b4c69e` feat — project-independent folder/page queries + client-safe effective-set helpers
4. `1b29d82` feat — buildPagesTree parent_id hierarchy
5. `224cef9` feat — Server Actions + cycle guard
6. `9029e82` test — cross-user folder_projects RLS
7. `a81d450` feat — folder hierarchy render + folder_projects Realtime wiring

## Verification
- `npx tsc --noEmit` clean for all Phase 21 files (only the 6 pre-existing api-jarvis-tts baseline errors remain).
- `npx next build` succeeds end-to-end.
- `npx vitest run tests/folder-projects-rls.test.ts` — 3 passed.

## OUTSTANDING
- **Remote/prod migration apply.** `0034` is applied to LOCAL Docker Supabase only. Apply `apps/web/supabase/migrations/0034_wiki_data_model_restructure.sql` to the remote Supabase project before the wiki ships to prod, and confirm the backfill landed.

---
*Phase: 21-wiki-data-model-restructure*
*Completed: 2026-06-21*
