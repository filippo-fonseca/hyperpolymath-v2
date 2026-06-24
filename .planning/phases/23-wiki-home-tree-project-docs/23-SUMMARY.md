# Phase 23 — Summary

## What shipped
The Phase 21 independent folder hierarchy now renders everywhere with
effective-project pills and a clear inherited-vs-direct distinction.

1. **Tree-builder page pills** — `TreePage` now carries `projectLinks`
   (`ProjectPillLink[]`). `buildPagesTree` computes each page's pills from its
   own `pages_projects` (direct) unioned with the effective project set of the
   folder it sits in (inherited, attributed to that folder). The
   `{ roots, standalonePages }` return shape is unchanged, so existing callers
   keep working. The pure builder helper `buildPageProjectPills` lives in the
   client-safe `lib/pages/folder-projects.ts` (no DB import).

2. **Shared pills** — `components/pages/ProjectPill.tsx` exposes `ProjectPill`
   and `ProjectPillRow`, reusing the existing project-chip vocabulary from
   `PageDetailClient` (solid surface chip for direct, dashed border for the
   ghosted inherited variant).

3. **/wiki home** — `PagesListClient` loads projects (id -> name), subscribes to
   the projects table, and renders effective-project pills on every folder row
   (own + inherited) and every page row (direct + inherited). Folder and page
   rows were split into a clickable toggle button plus a pills sibling so pills
   never nest inside a button.

4. **Project Docs/Wiki** — `ProjectPagesSection` was rebuilt on `buildPagesTree`.
   It prunes the tree to the subtrees whose effective project set includes the
   current project (descendants preserved, full hierarchy), renders pills on
   folders and pages, tags folders whose membership is inherited from an
   ancestor with an "inherited" chip, and lists loose standalone pages under an
   Unfiled group. All existing folder CRUD (new folder, new page, rename,
   delete, move) is preserved.

## Inherited vs direct (visual)
Direct links render as solid `bg-[var(--surface)]` mono chips with a solid edge;
inherited links render dashed, ghosted (lower opacity), and italic with an
`title="Inherited from <folder>"` tooltip. Folders inherited into the current
project additionally get a small dashed "inherited" tag next to the name.

## Commits (after the Phase 21/22 fast-forward merge)
- `4562f79` docs(wiki): plan Phase 23 wiki home tree + project Docs/Wiki pills
- `eb7283f` feat(wiki): attach per-page project pills (direct vs inherited) in tree builder
- `b6077f8` feat(wiki): add ProjectPill + ProjectPillRow for effective-project pills
- `5dd83cb` feat(wiki): render effective-project pills on /wiki home folders and pages
- `0854c06` feat(wiki): project Docs/Wiki lists folder hierarchy + standalone pages by effective set
- (this SUMMARY commit)

## Verification
- `pnpm --filter web typecheck` — clean except the 6 known pre-existing errors in
  `tests/api-jarvis-tts.test.ts` (NextRequest vs Request), which predate this phase.
- `pnpm --filter web build` — see commit; run from repo root (never `next build`
  inside apps/web).
- Note: the worktree had no `node_modules`; ran `pnpm install --frozen-lockfile`
  before typecheck/build.

## Outstanding / risk
- Pills resolve project ids to names via the loaded projects list; an id with no
  known name (deleted / not visible) is silently skipped rather than shown as a
  raw uuid. Intentional.
- Inherited links are display-only here; Phase 24 owns making them truly
  read-only in the link-editing affordances.
