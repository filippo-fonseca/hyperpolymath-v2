# unit-fix-wiki — verification note (PR #294 pre-merge fixes)

Branch `sd3/unit-fix-wiki` off `2ca2f158`. Two user-ordered items, each its own
atomic commit.

## Verdict
Both items implemented; `typecheck` + `build` green. Authed pixel-verify of the
two surfaces is deferred to the Conductor on :3000 (§1) — this fresh worktree has
no `.env.local`, so there is no real Supabase session/DB to drive the authed
surfaces headlessly. Status → `awaiting_review`.

## Commits
- `713d9320` — item 2 (realtime): `apps/web/components/pages/PagesListClient.tsx`
- `f7ca466e` — item 1 (tasks rail): `apps/web/components/tasks/InboxColumn.tsx`,
  `apps/web/components/tasks/TasksClient.tsx`

## Gate results
- `pnpm --filter web typecheck` → **PASS** (`tsc --noEmit`, exit 0).
- `pnpm --filter web build` → **PASS** (exit 0). First run failed only at page-data
  collection with `DATABASE_URL is not set` (thrown by `lib/db/client.ts:43`) for
  the unrelated `/api/captures/link-preview` route — a pure env gap in this
  env-less worktree, NOT a code fault. Re-ran with placeholder
  `DATABASE_URL`/Supabase vars (postgres.js connects lazily, so a dummy URL passes
  module eval) → full route table emitted incl. `/tasks`, `/wiki`, exit 0.
- Headless boot on :3833 (`next start`, placeholder env) → **Ready**; `/tasks`
  returns **307 → /sign-in** (auth-gated, no session), confirming authed capture is
  blocked here. Both-theme unauth fallback captured as proof-of-boot:
  `.planning/sd3-fixwiki-signin-fallback-{dark,light}.png` (1440×900). Browser lock
  acquired/released per §1; server stopped by port (`kill $(lsof -ti tcp:3833)`) per
  §3.

## ⚠️ Scope validation finding (item 1 surface)
The seed (`fable-plan-fix-wiki.md`) fenced item 1 to `components/wiki/**` and called
it "the wiki sidebar/rail". That is a factual error: the **Overdue** and
**Inbox · undated** sections it describes exist ONLY on the **tasks** page
(`components/tasks/OverdueTasksPanel.tsx` — already collapsible via
`tasks-overdue-panel-open`; `components/tasks/InboxColumn.tsx`; laid out in
`components/tasks/TasksClient.tsx`). The wiki home (`/wiki` → PagesListClient →
JournalRail + WikiExplorer) has no such sections. RUN.md L49 records the user's
punch-list verbatim and matches the tasks Overdue+Inbox pairing. Item 1 was
therefore implemented on `components/tasks/**` as a **documented, revertible fence
extension** (uncontended by sibling units people-sidebar/lifeos). Recorded in
`advisor/unit-fix-wiki.md` + the control file. If the Conductor prefers item 1 in a
tasks-fenced unit, revert `f7ca466e` — item 2 stands alone.

## Item 1 — tasks triage rail (collapsible Inbox, half-and-half with Overdue)
- Inbox is now a collapsible disclosure that adopts Overdue's EXACT grammar:
  `.sd-panel` surface, a chevron header button (`ChevronDown`/`ChevronRight` 15px),
  a localStorage-persisted open/closed boolean (`tasks-inbox-panel-open`, mirroring
  Overdue's `usePersistentBoolean`), and the matched 200ms `AnimatePresence`
  height/opacity collapse (ease `[0.16,1,0.3,1]`). Neutral grammar (no functional
  hue) with a lucide `Inbox` glyph; the drag-target cyan ring is preserved.
- Overdue + Inbox now sit half-and-half in a shared rail: `flex flex-row items-start
  gap-3`, each half `min-w-0 flex-1` (equal split; titles truncate rather than
  overflow). Both toggle independently → both can be open at once. When only one is
  present (no overdue work, or Inbox hidden) that panel spans the full rail. The
  central day surface is now full width beneath the rail.
- DnD preserved: the whole Inbox `<section>` (header included) stays a native-HTML5
  drop target, so `handleInboxDrop` fires even when the panel is collapsed; all
  `draggedTaskId`/`onDragStart`/`onDragEnd` wiring is unchanged. Overdue cards remain
  draggable to day targets. The existing "Hide inbox" control still gates rendering.

## Item 2 — realtime page rename/create/delete on the wiki home
- Root cause: the wiki-home entity queries in `PagesListClient` inherit the global
  `QueryProvider` defaults (`refetchOnMount:false`, `staleTime:30_000`). A rename
  done inside a page view happens while `/wiki` is unmounted; the pages Realtime
  channel only refetches **active** observers, so the inactive wiki-home query is
  merely marked stale, and on same-tab return `refetchOnMount:false` serves the
  cached (old-title) list until a manual refresh.
- Fix: set `refetchOnMount:"always"` on the four wiki-home data queries (`pages`,
  `page_folders`, `folder_projects`, `daily-pages`). Navigate-back now always
  re-fetches, so create/rename/delete propagate live across cards, list, and the
  journal rail. The existing `useTableSubscription("pages", …)` continues to cover
  the concurrent-tab case (active observer → live refetch). Invalidate-and-refetch
  only; no hand-merged payloads (CLAUDE.md Critical Pattern 3).
- Why not `router.refresh()` alone: it busts the RSC router cache but the cached
  stale TanStack entry still wins under `refetchOnMount:false`, so the title stays
  stale. Forcing the mount-time refetch is the reliable lever and stays entirely in
  the wiki-pages data layer (primary fence).

## Authed verification handoff (Conductor, :3000)
1. Wiki realtime: open `/wiki`, open a page, rename it, hit back → the card/list/rail
   title updates without a manual refresh. (Cross-tab: rename in tab A → tab B `/wiki`
   updates live.)
2. Tasks rail: open `/tasks` with ≥1 overdue task + ≥1 undated task → Overdue (left)
   and Inbox (right) render 50/50; toggle each chevron independently (both open at
   once; state persists across reload); drag a card onto the collapsed Inbox → moves
   to inbox. Capture dark + light 1440×900 + a rail crop.
