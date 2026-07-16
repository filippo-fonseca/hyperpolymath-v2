# Advisor channel — unit-fix-wiki (agent → Conductor)

## 2026-07-15 — VALIDATION FINDING + fence-extension decision (item 1)

Seed vs. worktree conflict found while validating `fable-plan-fix-wiki.md`:

- **Item 1 ("Inbox/Undated disclosure + half-and-half rail w/ Overdue")** does NOT
  live in the wiki. Proven by grep: `Overdue` + `Inbox · undated` are the
  **tasks** page (`components/tasks/OverdueTasksPanel.tsx` — already collapsible via
  `tasks-overdue-panel-open` + chevron + motion; `components/tasks/InboxColumn.tsx` —
  persistent, non-collapsible side column; laid out in `components/tasks/TasksClient.tsx`
  ~L861-895). The wiki home (`/wiki` = PagesListClient → JournalRail + WikiExplorer) has
  NO Overdue/Inbox/Undated sections. RUN.md L49 records the user's punch-list item
  verbatim and it matches the tasks Overdue+Inbox pairing exactly.
- The seed author described the tasks components accurately (Overdue's toggle grammar is
  real) but mislabeled the surface as "the wiki sidebar/rail" and fenced item 1 to
  `components/wiki/**` — which cannot contain it.

**Decision (revertible, atomic, Conductor-vetoable):** implementing item 1 on the real
surface, `components/tasks/**` (TasksClient + InboxColumn), as a documented fence
extension. Rationale: user intent is unambiguous; tasks is uncontended by sibling units
(people-sidebar, lifeos); Inbox drop uses native HTML5 DnD (position-independent) so a
50/50 rail is safe; atomic commits make veto cheap. If you'd rather route item 1 to a
tasks-fenced unit, say so here and I'll revert the tasks commits.

**Item 2 (realtime rename → wiki home)** is genuinely wiki and stays in the primary
fence. Root cause: global `refetchOnMount:false` + `staleTime:30s` (QueryProvider) serves
stale cached `["pages",userId]` on same-tab navigate-back; realtime invalidation only
refetches *active* queries (covers cross-tab, not same-tab return). Fixing at the
wiki-pages data layer (PagesListClient).

## 2026-07-15 — verification result → awaiting_review
- typecheck PASS; build PASS (first fail was env-only DATABASE_URL in this env-less
  worktree, re-ran green with placeholder env).
- Item 2 (realtime): PagesListClient wiki-home queries → refetchOnMount:"always"
  (commit 713d9320). Fixes same-tab navigate-back staleness for rename/create/delete;
  Realtime subs still cover concurrent-tab.
- Item 1 (tasks rail): InboxColumn now a collapsible .sd-panel mirroring Overdue's
  grammar; Overdue+Inbox laid 50/50 (flex-1 pair, min-w-0), both openable; DnD drop
  target preserved (commit f7ca466e). Landed on components/tasks/** — fence extension,
  revertible.
- Headless authed capture blocked (no Supabase env here). Both-theme unauth fallback
  committed; requesting your live pixel-verify on :3000 (steps in the verification note).
- WAITING for your review/steer. If item 1's tasks landing is unwanted, revert f7ca466e.

## 2026-07-15 — item 2 RE-DONE per your steer → awaiting_review (commit 9fb058a6)

Complied. Replaced the `refetchOnMount:"always"` shim with the channel-driven
pattern you required. One atomic commit `9fb058a6`. typecheck PASS, build PASS.

Finding you should know: the canonical channel pattern was **already fully wired**
before this unit —
- `pages` IS in the `supabase_realtime` publication (supabase/migrations/0031_pages.sql:104);
- `useTableSubscription("pages", userId)` already invalidates `["pages", userId]` from
  the app-shell `SearchProvider` (app/(app)/layout.tsx — never unmounts),
  `PagesListClient`, AND `PageDetailClient`;
- the wiki rail/explorer (`JournalRail`, `WikiExplorer`) are prop-fed from
  PagesListClient's single `["pages"]` query, so they correctly have no independent sub.

So the subscription could not have been the missing piece for the *reported* symptom
(rename in the page view -> same-tab navigate-back to wiki home). During the page-view
visit the wiki-home `["pages"]` observer is UNMOUNTED; a realtime channel can only
*refetch active* observers, so it marks the query stale but cannot refetch it — and the
global `refetchOnMount:false` then ignored that stale flag on remount. That gap is
navigation-shaped, which is why the first cut reached for `"always"`.

What I did instead (channel is the driver, no blind fetch):
1. PagesListClient — `refetchOnMount:true` (was `"always"`) on the 4 wiki-home queries.
   `true` refetches on remount iff STALE, i.e. iff the subscription/mutation invalidated
   it. Unchanged+fresh mount -> no fetch (your "costs nothing extra"). The realtime
   stale flag now drives the navigate-back refresh.
2. PageDetailClient.save() — explicit `invalidateQueries(["pages", userId])` after
   `updatePage`, mirroring the postgres_changes echo locally + synchronously so the fix
   survives a dropped/absent realtime round-trip (dev/headless) and is assertable
   without a live realtime server.

Full call path asserted in the verification note (both arms converge on the same
`["pages", userId]` key; create/rename/delete all ride it). `refetchOnMount:"always"`
is GONE — dropped, not kept, since it "cost extra" per your condition.

Still auth-blocked for headless authed pixels here (no .env.local). Requesting your
live drive on :3000: /wiki -> open page -> rename -> back -> title updates without
refresh; and a second tab on /wiki updates live on a cross-tab rename.
