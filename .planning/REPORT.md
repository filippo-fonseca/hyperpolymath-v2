# Wave 3 — `daily-pages-rail` REPORT

## What shipped

The old collapsible "Daily Pages" block in `PagesListClient` is gone, replaced by
the editorial **Journal rail** and a client-side auto-create-today hook. The
Explorer below is unchanged; wave-2's daily-page exclusion filter is preserved
(no duplication).

### Commits (atomic, one per slice)

| SHA | Slice | What |
|---|---|---|
| `3f1cfd89` | 1 | `useEnsureTodayDailyPage` hook + pure `shouldEnsureTodayDailyPage` guard + 12 vitest cases (all 5 daily-page helpers now covered) |
| `c5e32e90` | 2 | `JournalRail` presentational: today card (glass, Garamond date, cyan tick, live `PagePreviewThumb`), 7-day trail cards, calendar popover reusing `JournalCalendar` |
| `eb9edd2c` | 3 | Collapse persisted in `localStorage["wiki:journal-rail"]` + first-mount staggered 180ms fade/slide (10ms/item, cap 24) with reduced-motion respect |
| `f76ec3d3` | 4 | Wired the rail into `PagesListClient`'s placeholder; the old block deleted; `["daily-pages", userId]` query key untouched so `TopTabBar` / `useQuickCreateActions` / `DailyAutoOpen` keep reading one cache |

`PagesListClient.tsx` shrinks from 280 → 191 LOC.

## How it satisfies the brief

- **Auto-create today, no navigation.** `useEnsureTodayDailyPage` runs on mount:
  computes today client-side (`format(new Date(), 'yyyy-MM-dd')`), checks the
  daily-pages cache, calls the guarded insert (`openDailyPage`) only if missing,
  invalidates `["daily-pages", userId]` on success, fires at most once per mount
  per date. Race-safe against `DailyAutoOpen` via the shared partial unique
  index — the second write becomes a no-op.
- **Editorial contrast to the flat Explorer.** Today's card is `.glass-tile` with
  a Garamond date heading and a subtle cyan "today" tick. Trail cards use the
  Spacedrive `--sd-box` / `--sd-line` palette per Doctrine-3, so the rail reads
  as reading-room glass sitting above the Explorer's dense chrome.
- **Calendar reaches arbitrary dates.** The "Earlier" popover renders
  `JournalCalendar` with `markedDates` derived from `dailyPages`; picking a past
  date routes to it or offers creation (mirrors existing `dailyDayClickAction`
  semantics), then closes.
- **Collapse persisted.** `localStorage["wiki:journal-rail"]` with an SSR-safe
  first-render (start expanded, reconcile on mount) to avoid hydration mismatch.
- **Exclusion invariant verified, not duplicated.** Wave 2's Explorer already
  filters `!page.dailyDate` (`explorer-hooks/explorer-items.ts:38, 92`) —
  nothing added here.
- **Contracts kept stable.** `["daily-pages", userId]` query key unchanged;
  `dailyDayClickAction` / `dailyPageTitle` reused; `DailyAutoOpen` untouched.

## Verification

- `pnpm --filter web exec tsc --noEmit` — **clean**.
- `pnpm --filter web build` — **succeeds** (only pre-existing CSS `::highlight()`
  warnings from `page-block-editor.css` remain; not touched by wave 3).
- `pnpm --filter web exec vitest run lib/pages/ components/wiki/` — **17/17 pass**
  (12 new daily-page cases + 5 existing preview cases).
- Full vitest baseline (pre-wave-3 at commit `8115df93`): 33 failed / 1324 passed.
  Post-wave-3: 29 failed / 1328 passed. **No new failures** — wave 3 adds 4 net
  passing tests; every existing failure is in unrelated jarvis / voice / journal
  test files.

## Files added

- `apps/web/lib/pages/useEnsureTodayDailyPage.ts` (56 LOC)
- `apps/web/lib/pages/__tests__/daily-page.test.ts` (98 LOC, 12 cases)
- `apps/web/components/wiki/journal/JournalRail.tsx` (~455 LOC)

## Files modified

- `apps/web/lib/pages/daily-page.ts` — added `shouldEnsureTodayDailyPage` pure guard.
- `apps/web/components/pages/PagesListClient.tsx` — replaced the placeholder
  block with `<JournalRail/>`; removed unused `dailyOpen`/`selectedDate`/
  `markedDays`/`todayIso`/`dailyByDate` state; added
  `useEnsureTodayDailyPage(userId, dailyPages, dailyFetched)`;
  `openingDay: boolean` → `openingDate: string | null` so per-day loading
  states show independently.

## Non-goals honored

- `ProjectPagesSection`, `PageDetailClient`, and Explorer internals untouched.
- `pages.dailyDate` schema untouched.
- No copy-paste of Spacedrive assets — the rail uses `PagePreviewThumb` and
  lucide icons only.
- App-wide accent stays `--hud-cyan`; nothing new introduced.
