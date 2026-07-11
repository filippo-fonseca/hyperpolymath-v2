# Unit brief — `daily-pages-rail` (wave 3)

**Read first:** `.bgsd/runs/sesh-1783700667211/SPEC.md` (binding). Base includes the merged
wave-2 Explorer. Executor: Opus. You own the Journal-rail section of the Wiki home + the
auto-create hook. Sibling `coherence-pass` owns ProjectPagesSection/PageDetail — don't touch
those.

## Goal

Daily pages become their own beautiful section — the Journal rail — with today's page
auto-created the moment you land on Wiki (localtime), rendered as editorial glass (this is
the "reading room" per SPEC §Doctrine-3: glass tiles + Garamond dates ARE appropriate here,
in deliberate contrast to the flat Explorer below).

## Current state

- The old collapsible Daily Pages section in `PagesListClient.tsx` (wave 2 left it as a
  marked placeholder) + `JournalCalendar` + "no daily page" tile.
- Data: `pages.dailyDate` (yyyy-MM-dd), partial unique per user/day; `["daily-pages", userId]`
  query key; `openDailyPage({ date })` idempotent guarded insert (`app/actions/pages.ts`
  L273) — but it's used via flows that navigate. `apps/web/lib/pages/daily-page.ts`
  (`dailyPageTitle`), `useTodayDailyPage.ts` hook, `DailyAutoOpen.tsx` (app-wide auto-open
  redirect — LEAVE its behavior; coordinate, don't duplicate: if it already navigated today,
  the rail simply shows the page).
- `TopTabBar.tsx` L114 "Today" link + `useQuickCreateActions` depend on daily queries — keep
  keys stable.

## Deliverables

1. **Auto-create today (no navigation):** a `useEnsureTodayDailyPage` hook mounted on the
   Wiki home: compute today CLIENT-SIDE localtime (`format(new Date(), 'yyyy-MM-dd')`,
   date-fns), check the daily-pages cache, and if missing call the guarded insert (reuse
   `openDailyPage` or a thin `ensureDailyPage` action that does NOT imply navigation),
   then invalidate `["daily-pages", userId]`. Idempotent, race-safe (the partial unique
   index is the backstop), fires at most once per mount per day. No redirect, no toast.
2. **The Journal rail** — replace the placeholder section: a horizontal rail above the
   Explorer. Today's card: larger glass tile, Garamond date heading ("Thursday, July 10"),
   live `PagePreviewThumb` of its content, subtle cyan "today" tick; click → page. Previous
   ~7 days trail as smaller cards (preview + short date); an "earlier" affordance opens the
   calendar popover (reuse/restyle `JournalCalendar`) for any date — picking an empty past
   date offers creation (existing `dailyDayClickAction` semantics). Horizontal scroll with
   `custom-scrollbar`, snap alignment, motion: cards fade/slide in 180ms staggered on first
   mount only.
3. **Collapse control:** the rail can collapse to a slim strip (persist
   `localStorage["wiki:journal-rail"]`), replacing the old collapsible behavior.
4. **Exclusion invariant:** daily pages never render in the Explorer grid/list below
   (verify wave 2's filter; enforce here if missing).

## Acceptance criteria

- Land on `/wiki` with no daily page for today → row appears in DB within moments, rail
  shows today's card, NO navigation occurred. Reload → no duplicate (unique index quiet).
- Rail renders previews for days with content; calendar reaches arbitrary dates.
- "Today" in TopTabBar and quick-create still work; `DailyAutoOpen` unaffected.
- Build + typecheck green; Playwright drives: fresh load → today card exists → click →
  editor opens → back → rail intact.
