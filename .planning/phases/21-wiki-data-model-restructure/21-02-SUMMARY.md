---
phase: 21-wiki-data-model-restructure
plan: 02
subsystem: api
tags: [drizzle, server-actions, tanstack-query, supabase-realtime, rls, vitest, tree, react]

requires:
  - phase: 21-wiki-data-model-restructure (plan 01)
    provides: page_folders.parent_id, folder_projects junction, pages.folder_id, folder_projects RLS + Realtime
provides:
  - "Project-independent folder/page queries (getFoldersWithProjects, getFolderProjects, getFoldersByEffectiveProject)"
  - "Client-safe effective-project-set helpers (lib/pages/folder-projects.ts) usable in browser components"
  - "buildPagesTree rewritten to a parent_id hierarchy with effective project sets + isInherited/sourceFolder flags"
  - "Server Actions: createFolder(parentId), setParentFolder (cycle guard), setFolderProjects, setPageFolder→pages.folder_id"
  - "Cross-user folder_projects RLS integration test (vitest, 3 passing)"
  - "PagesListClient + ProjectPagesSection render the folder hierarchy and subscribe to folder_projects Realtime"
affects: [23-wiki-tree-ui, 24-wiki-linking-ux]

tech-stack:
  added: []
  patterns:
    - "Client-safe pure-logic module split: runtime helpers + types live in lib/pages/*, DB query module re-exports them so client components don't pull in the postgres driver"
    - "In-TS visited-guarded ancestor walk for effective project sets (own ∪ all ancestor links, deduped)"
    - "App-layer cycle guard on reparent: walk parentId's ancestor chain, reject if folderId appears"

key-files:
  created:
    - apps/web/lib/pages/folder-projects.ts
    - apps/web/tests/folder-projects-rls.test.ts
  modified:
    - apps/web/lib/db/queries/folders.ts
    - apps/web/lib/db/queries/pages.ts
    - apps/web/lib/pages/tree.ts
    - apps/web/app/actions/folders.ts
    - apps/web/app/actions/pages.ts
    - apps/web/app/(app)/pages/page.tsx
    - apps/web/components/pages/PagesListClient.tsx
    - apps/web/components/pages/PageDetailClient.tsx
    - apps/web/components/projects/ProjectPagesSection.tsx

key-decisions:
  - "Extracted pure helpers + types into lib/pages/folder-projects.ts (deviation): ProjectPagesSection is a client component and importing getEffectiveProjectIds from the DB query module dragged the postgres driver into the browser bundle and broke the build. The query module re-exports them so server callers keep a single import site."
  - "buildPagesTree drops the sidebar-areas argument entirely; /pages now feeds it folders + folder_projects links instead of the area/project tree."

patterns-established:
  - "TreeFolder.projectLinks carries { projectId, isInherited, sourceFolder? } so downstream phases render inherited links read-only with no schema change"
  - "ProjectPagesSection shows folders whose effective project set includes the project (own ∪ inherited), not a flat project_id filter"

requirements-completed: [WIKI-MODEL-04, WIKI-MODEL-05, WIKI-MODEL-06, WIKI-MODEL-07]

duration: ~50min
completed: 2026-06-21
---

# Phase 21 (Plan 02): Query + Action + UI Rewrite Summary

**The wiki query/mutation/UI layer is now organized by a project-independent folder hierarchy: queries load folder_projects and compute each node's effective project set via an in-TS ancestor walk, Server Actions enforce an app-layer cycle guard on reparenting, and a cross-user RLS test proves folder_projects owner isolation.**

## Accomplishments
- Rewrote the folder/page queries for the new schema and added `getFoldersWithProjects` / `getFolderProjects` / `getFoldersByEffectiveProject` (replacing `getFoldersForProject`, which selected on the dropped `page_folders.project_id`). Folder placement is read from `pages.folder_id` directly.
- Rewrote `buildPagesTree(folders, folderProjectLinks, pages)` to a `parent_id` hierarchy returning `{ roots, standalonePages }`, with each node exposing `ownProjectIds`, `inheritedProjectIds`, `effectiveProjectIds`, and per-link `isInherited` / `sourceFolder`.
- Updated Server Actions: `createFolder` (optional `parentId`, no `projectId`), `setParentFolder` (rejects self-parent + ancestor cycles), `setFolderProjects` (replace the M:N link set, user_id from getClaims), `setPageFolder` (writes `pages.folder_id`, no project cross-check), `createPage` (folderId onto the page row).
- Added `tests/folder-projects-rls.test.ts` — cross-user select/insert-as-A/delete isolation. **vitest: 3 passed.**
- Rewrote `PagesListClient` to render the folder hierarchy + Standalone group, switched `/pages` to feed folders + folder_projects links, updated `ProjectPagesSection` to use effective project sets and the new action signatures, fixed the `PageDetailClient` breadcrumb to read the page-level folder name, and wired `useTableSubscription("folder_projects", userId)` into both folder-tree components.

## Task Commits
1. **Task 1a: query layer + client-safe helpers** - `8b4c69e` (feat)
2. **Task 1b: buildPagesTree hierarchy** - `1b29d82` (feat)
3. **Task 2a: Server Actions + cycle guard** - `224cef9` (feat)
4. **Task 2b: cross-user RLS test** - `9029e82` (test)
5. **Task 3 + UI consumers: folder hierarchy render + folder_projects Realtime** - `a81d450` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Build correctness] postgres driver leaked into the client bundle**
- **Found during:** Build verification after Task 3.
- **Issue:** `ProjectPagesSection` (a client component) imported `getEffectiveProjectIds` from `lib/db/queries/folders.ts`, which transitively imports the `db` client (node-only `postgres`). `next build` failed with module-not-found traces for the postgres driver in the Client Component bundle.
- **Fix:** Extracted the pure helpers (`getInheritedProjectIds`, `getEffectiveProjectIds`) and the shared types (`FolderRow`, `FolderWithProjects`, `FolderProjectLink`) into a new client-safe `apps/web/lib/pages/folder-projects.ts` with zero DB imports; `folders.ts` re-exports them so server callers are unchanged. Client components (`PagesListClient`, `ProjectPagesSection`) and `tree.ts` import from the pure module.
- **Verification:** `npx next build` compiles and passes TypeScript; `/pages`, `/pages/[pageId]`, `/projects/[projectId]` all build.
- **Committed in:** `8b4c69e` (the helpers were placed in the pure module from the query-layer commit onward).

**Total deviations:** 1 auto-fixed (build correctness). **Impact:** necessary for the build to pass; no scope creep — same logic, relocated to a client-safe module.

## Issues Encountered
- RLS test `beforeAll` first failed because `projects.area_id` is NOT NULL — fixed by creating an area for user A before the project. Test then passed (3/3).
- Fresh worktree lacked `.env.test.local` / `.env.local` (both gitignored) — copied from the main checkout for verification only; they are not committed.

## Verification
- `npx tsc --noEmit` — clean for all Phase 21 files (the only remaining errors are 6 pre-existing `tests/api-jarvis-tts.test.ts` Request-vs-NextRequest errors present on the clean baseline).
- `npx next build` — succeeds end-to-end.
- `npx vitest run tests/folder-projects-rls.test.ts` — 3 passed.
- Plan grep checks — all present (getFoldersWithProjects, getFoldersByEffectiveProject, effectiveProjectIds, inheritedProjectIds, standalonePages, sourceFolder, setParentFolder, setFolderProjects, the folder_projects subscriptions; getFoldersForProject removed).

## Next Phase Readiness
Data layer for phases 23 (tree UI) and 24 (linking UX) is ready: the `isInherited` / `sourceFolder` flags are computed here so those phases need no schema change. **Remote/prod migration apply (from plan 21-01) remains OUTSTANDING.**

---
*Phase: 21-wiki-data-model-restructure*
*Completed: 2026-06-21*
