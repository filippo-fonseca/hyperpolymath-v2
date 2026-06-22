# Phase 23 — Wiki home tree + project Docs/Wiki with effective-project pills

## Goal
Render the Phase 21 independent folder hierarchy with EFFECTIVE-PROJECT PILLS and an
inherited-vs-direct distinction across the `/wiki` home and each project's Docs/Wiki
section.

## Tasks
1. **Tree-builder page-pill data** (`lib/pages/tree.ts`, `lib/pages/folder-projects.ts`)
   - Extend `TreePage` with `projectLinks: ProjectLink[]` (direct = page's own
     `pages_projects`; inherited = containing folder's `effectiveProjectIds`).
   - Add a pure, client-safe helper for building a page's project links from its
     direct project ids + its folder's effective set, with the inherited source
     folder name attached. Keep `folder-projects.ts` free of any DB import.
   - Do NOT break the existing `{ roots, standalonePages }` return shape.

2. **Home: folder pills** (`components/pages/PagesListClient.tsx`)
   - Render each folder row's `projectLinks` as pills (direct solid, inherited dashed).
   - Load projects (id -> name) so pills are labeled, not raw ids.

3. **Home: page pills** (`components/pages/PagesListClient.tsx`)
   - Render each `TreePage.projectLinks` as pills on the page row (direct + inherited).

4. **Project Docs/Wiki by effective set** (`components/projects/ProjectPagesSection.tsx`)
   - Already filters folders by effective set; render descendant subfolders too
     (full hierarchy, not just the direct-linked folders), and standalone pages.
   - Show pills on folders/pages with the inherited distinction; mark folders whose
     membership in THIS project is inherited from an ancestor.

5. **Inherited styling** (shared pill component)
   - One `ProjectPill` presentational component: direct = solid surface chip;
     inherited = dashed, ghosted, `title="inherited from <folder>"`.

6. **Planning docs** — this PLAN + SUMMARY.

## Success criteria
1. Wiki home shows folders/subfolders/pages + standalone pages, each with
   effective-project pills.
2. A project page shows its linked folders (with descendants) and standalone pages
   grouped by hierarchy.
3. Inherited assignments render with a distinct pill style from direct links.

## Verification
- `pnpm --filter web typecheck` clean except the 6 known pre-existing
  `tests/api-jarvis-tts.test.ts` errors.
- `pnpm --filter web build` succeeds (run from repo root, never `next build` in apps/web).

## Constraints
- No DB table/column/migration changes.
- `folder-projects.ts` stays client-safe (no `postgres`/server imports).
- Commit often, explicit pathspecs, no push/amend/--no-verify.
