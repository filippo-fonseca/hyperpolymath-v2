# Phase 22 — Rename "Pages" → "Wiki" (user-facing only)

## Goal
Rename the feature from "Pages" to "Wiki" everywhere user-facing. The route
`/pages` becomes `/wiki`, with permanent redirects from `/pages` and
`/pages/[pageId]` to the `/wiki` equivalents. Nav/sidebar labels, command-menu
entries, project-page section headings, and all user-visible copy read "Wiki".

## Scope guardrails (do NOT touch)
This is a user-facing rename only. Leave untouched:
- DB table names: `pages`, `page_folders`, `pages_projects`, `folder_projects`.
- Drizzle schema identifiers, Realtime channel/table registrations, and
  `lib/realtime/query-keys.ts` keys that map to those tables.
- SQL migrations under `apps/web/supabase/migrations/`.
- Server Action / query function names (e.g. `getPagesForUser`, `createPage`)
  unless every call site is updated in the same commit.

Individual documents stay conceptually "pages" inside the Wiki. We do not rename
every `Page`/`page` code symbol; only the feature surface (route, list/home
view, nav labels, command menu, project section headers, visible copy).

## Tasks (one commit per logical unit)
1. Move route `app/(app)/pages/` → `app/(app)/wiki/` (git mv) and update the
   route files' internal copy/comments + the post-delete `router.push`.
2. Add permanent `redirects()` in `next.config.ts`:
   `/pages → /wiki` and `/pages/:pageId → /wiki/:pageId`.
3. Update sidebar nav label + href in `PersistentNav.tsx` (`/pages` → `/wiki`,
   "Pages" → "Wiki").
4. Update command menu (`CommandMenuContent.tsx`): section label "Pages" →
   "Wiki", and the `router.push` target → `/wiki/...`.
5. Update `ProjectPagesSection.tsx`: section heading "Pages" → "Wiki" and the
   two `/pages` pushes → `/wiki`.
6. Update client list/detail components (`PagesListClient.tsx`,
   `PageDetailClient.tsx`): visible "Pages" heading → "Wiki" and `/pages`
   navigation → `/wiki`.
7. Update `lib/search.ts`: search-type label "Pages" → "Wiki" and the result
   href `/pages/:id` → `/wiki/:id`.
8. Planning docs (this file + 22-SUMMARY.md).

## Success criteria
1. Visiting `/pages` or `/pages/[id]` redirects to the `/wiki` equivalent
   (`/wiki`, `/wiki/[id]`).
2. No user-facing "Pages" label remains in the UI; sidebar/nav, command menu,
   and project sections say "Wiki".

## Verification (from apps/web/)
- `npx tsc --noEmit` — clean except 6 known pre-existing unrelated errors in
  `tests/api-jarvis-tts.test.ts`.
- `npx next build` — succeeds.
- Grep confirms redirects in `next.config.ts` and no user-facing "Pages" label.
