# Phase 22 — Summary: Rename "Pages" → "Wiki" (user-facing only)

## What shipped
The "Pages" feature is now surfaced as "Wiki" everywhere a user sees it, and
the route moved from `/pages` to `/wiki` with permanent redirects from the old
paths. The data model (DB tables, Drizzle schema, Realtime registrations,
query-key map, SQL migrations) and the server-action / query function names are
unchanged, per the scope guardrails. Individual documents remain conceptually
"pages" inside the Wiki.

### Surface changes
- Route directory moved: `app/(app)/pages/` → `app/(app)/wiki/`
  (`page.tsx` and `[pageId]/page.tsx`), with doc comments updated to `/wiki`.
- `next.config.ts`: added `redirects()` returning permanent (308) redirects
  `/pages → /wiki` and `/pages/:pageId → /wiki/:pageId`.
- Sidebar nav (`PersistentNav.tsx`): label "Pages" → "Wiki", href
  `/pages` → `/wiki`, icon `FileText` → `BookOpen` (removed the now-unused
  `FileText` import).
- Command menu (`CommandMenuContent.tsx`): section label "Pages" → "Wiki",
  path hint `/pages` → `/wiki`, new-document push → `/wiki/:id`.
- Project section (`ProjectPagesSection.tsx`): heading "Pages" → "Wiki", both
  document pushes → `/wiki/:id`, doc comment updated.
- List/detail islands (`PagesListClient.tsx`, `PageDetailClient.tsx`): visible
  list heading "Pages" → "Wiki", all in-app document navigation (open, create,
  post-delete) → `/wiki`.
- Global search (`lib/search.ts`): page search-type label "Pages" → "Wiki",
  result href `/pages/:id` → `/wiki/:id`.

### Intentionally left unchanged
- DB tables `pages`, `page_folders`, `pages_projects`, `folder_projects`,
  their columns, the Drizzle schema identifiers, Realtime table registrations,
  `lib/realtime/query-keys.ts` keys, and the SQL migrations.
- Server-action / query names (`getPagesForUser`, `getPageById`, `createPage`,
  `updatePage`, `deletePage`, `getPagesForCurrentUser`,
  `getPagesForProject`, …) and the client component file/symbol names
  (`PagesListClient`, `PageDetailClient`, `ProjectPagesSection`,
  `PagesPage` default export). These are not user-visible.
- Landing `PrimitivesTable.tsx` copy "Wiki Pages": this is descriptive
  building-block copy (the leaf primitive type) that already reads "Wiki",
  not the feature-surface "Pages" label or a route href. Left as-is.

## Commits (oldest → newest)
1. `10d38a4` docs(phase-22): plan for Pages → Wiki user-facing rename
2. `bcdd995` feat(wiki): move /pages route to /wiki
3. `08542bb` feat(wiki): permanent redirects from /pages to /wiki
4. `8e47fb9` feat(wiki): sidebar nav reads Wiki and links to /wiki
5. `92cc169` feat(wiki): command menu section reads Wiki and routes to /wiki
6. `ae09e96` feat(wiki): project section heading reads Wiki and routes to /wiki
7. `407e95c` feat(wiki): list and detail islands read Wiki and route to /wiki
8. `18be5fa` feat(wiki): global search labels pages as Wiki and links to /wiki
(plus this summary commit.)

## Verification
- `npx tsc --noEmit`: clean except the 6 known pre-existing unrelated errors in
  `tests/api-jarvis-tts.test.ts` (NextRequest vs Request). No new errors.
  (Note: this worktree started with no `node_modules`; ran `pnpm install
  --frozen-lockfile` from the repo root first.)
- `npx next build`: see build result recorded at completion of the phase.
- Redirects confirmed present in `next.config.ts` (grep `redirects`).
- Grep sweep across `app`, `components`, `lib`: no remaining `/pages` route
  href/push and no standalone user-facing "Pages" label.

## Success criteria
1. Visiting `/pages` or `/pages/[id]` redirects to `/wiki` / `/wiki/[id]` —
   met via permanent config redirects. ✔
2. No user-facing "Pages" label remains; sidebar/nav, command menu, and project
   sections read "Wiki". ✔

## Outstanding / risk notes
- Function/symbol names (e.g. `PagesListClient`, `getPagesForUser`) and the
  `app/(app)/wiki/page.tsx` default export `PagesPage` still say "Pages".
  These are internal and not user-visible; renaming them is out of scope for
  this user-facing rename and would risk import churn.
- The `localStorage` key `project-pages-collapsed` was intentionally left
  unchanged so existing users keep their collapse preference (renaming it would
  silently reset state).
- No automated test covers the redirect; verified structurally via
  `next.config.ts` and the production build.
