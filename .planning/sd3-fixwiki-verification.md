# unit-fix-wiki — verification note (PR #294 pre-merge fixes)

Branch `sd3/unit-fix-wiki` off `2ca2f158`. Two user-ordered items, each its own
atomic commit.

## Verdict
Both items implemented; `typecheck` + `build` green. Item 2 was **re-done per the
Conductor's steer** (channel-driven, not the `refetchOnMount:"always"` shim) — see
that section below. Authed pixel-verify of the two surfaces is deferred to the
Conductor on :3000 (§1) — this fresh worktree has no `.env.local`, so there is no
real Supabase session/DB to drive the authed surfaces headlessly. Status →
`awaiting_review`.

## Commits
- `a79c68fc` — item 2 **re-done** (channel-driven realtime): `PagesListClient.tsx`
  (`refetchOnMount:true`) + `PageDetailClient.tsx` (explicit `invalidateQueries`
  in `save()`) + this note.
- `713d9320` — item 2 first cut (`refetchOnMount:"always"`, superseded by `a79c68fc`).
- `f7ca466e` — item 1 (tasks rail): `apps/web/components/tasks/InboxColumn.tsx`,
  `apps/web/components/tasks/TasksClient.tsx` (Conductor ACCEPTED).

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

## Item 2 — realtime page rename/create/delete on the wiki home (RE-DONE per Conductor steer)

**Conductor rejected the first cut** (`refetchOnMount:"always"`, commit `713d9320`)
as a navigation shim rather than the canonical realtime channel pattern, and required
the `useTableSubscription` channel to be the driver. This is the re-done item 2.

### Audit — the canonical channel pattern was already fully wired
The `pages` table IS in the `supabase_realtime` publication
(`supabase/migrations/0031_pages.sql:104` → `ALTER PUBLICATION supabase_realtime ADD
TABLE public.pages`), and three `useTableSubscription("pages", userId)` consumers
already invalidate `["pages", userId]` on every INSERT/UPDATE/DELETE:
- app-shell `components/search/SearchProvider.tsx:52` (mounted in `app/(app)/layout.tsx`,
  never unmounts) — the always-on channel;
- `components/pages/PagesListClient.tsx:54` (wiki home);
- `components/pages/PageDetailClient.tsx:111` (page view).

The other wiki-home surfaces are **prop-fed** from PagesListClient's single `["pages"]`
query — `JournalRail` (`allPages` prop) and `WikiExplorer` (`pages` prop) issue no
independent query, so no extra subscription is warranted (audited, not omitted).

So the subscription was never the missing piece. The reported symptom is specifically
the **same-tab navigate-back** case: the rename happens in the page view while `/wiki`
is unmounted, so its `["pages"]` observer is inactive. A realtime channel can only
*refetch* active observers — an unmounted one cannot be refetched, only marked stale.
With the global `QueryProvider` default `refetchOnMount:false`, that stale flag was
ignored on remount → old title until a hard refresh.

### Fix — make the realtime invalidation drive the navigate-back refetch
Two changes, one atomic commit, entirely invalidate-and-refetch (no payload merge,
CLAUDE.md Critical Pattern 3):
1. `PagesListClient` — the four wiki-home queries (`pages`, `page_folders`,
   `folder_projects`, `daily-pages`) now use `refetchOnMount:true` (was `"always"`).
   `true` refetches on remount **iff the query is stale**, i.e. iff a subscription /
   mutation invalidated it. Unchanged + fresh (<30s `staleTime`) → no refetch, so it
   "costs nothing extra" (the Conductor's condition), while a real rename reliably
   refetches on navigate-back. The realtime stale flag is now the driver, not a blind
   every-mount fetch.
2. `PageDetailClient.save()` — after `updatePage`, explicitly
   `queryClient.invalidateQueries({ queryKey: tableKey("pages", userId) })`. This
   mirrors the postgres_changes echo locally and synchronously, so the fix does not
   depend on a live realtime round-trip (which is absent in dev/headless and can drop
   under reconnect). Any co-mounted wiki surface updates instantly; the unmounted wiki
   home is marked stale and refetches on navigate-back via (1).

### Asserted invalidation call path (rename in page view → wiki home live)
```
title edit → handleTitleChange → scheduleAutosave({title})
  → save() → updatePage({id,title})                       [DB write, bumps pages.updated_at]
      ├─ queryClient.invalidateQueries(["pages", userId])  [LOCAL, synchronous — PageDetailClient.save]
      └─ postgres_changes UPDATE on public.pages
           → SearchProvider useTableSubscription("pages")  [app-shell, always mounted]
           → queryClient.invalidateQueries(["pages", userId])
  ⇒ ["pages", userId] marked STALE (via either arm)
  navigate back to /wiki → PagesListClient remounts
    → useQuery(["pages"]) refetchOnMount:true sees isStale → refetch → fresh title
```
Both arms converge on the same `invalidateQueries(["pages", userId])` key; the local
arm is what makes it verifiable without a live realtime server, the channel arm is the
canonical driver for the concurrent / cross-tab case. Create + delete ride the same key
(useExplorerMutations `invalidatePages`, the `pages` channel), so all three propagate.

## Authed verification handoff (Conductor, :3000)
1. Wiki realtime: open `/wiki`, open a page, rename it, hit back → the card/list/rail
   title updates without a manual refresh. (Cross-tab: rename in tab A → tab B `/wiki`
   updates live.)
2. Tasks rail: open `/tasks` with ≥1 overdue task + ≥1 undated task → Overdue (left)
   and Inbox (right) render 50/50; toggle each chevron independently (both open at
   once; state persists across reload); drag a card onto the collapsed Inbox → moves
   to inbox. Capture dark + light 1440×900 + a rail crop.
