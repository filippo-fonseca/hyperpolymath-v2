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

---

# REPORT — `coherence-pass` (wave 3)

**Run:** sesh-1783700667211 · **Executor:** Opus · **Base:** merged wave-2 Explorer.

## Summary

Rebuilt `ProjectPagesSection` on the new Explorer primitives, widened page-detail
to `max-w-4xl` with chrome-coherent header, verified all touchpoints, deleted
the wave-1 dev scaffolds, and applied a focus-visible polish pass across the
Explorer chrome.

## Deliverables

### 1. `ProjectPagesSection` — rebuilt on Explorer primitives

`apps/web/components/projects/ProjectPagesSection.tsx` (was 675 LOC hierarchical
tree). New implementation is a single Drive-style grid:

- Top-level relevant folders render as dimensional `FolderIcon` tiles (72px,
  radial gradient, drop-shadow), with item counts.
- Loose pages linked directly to the project render as `PagePreviewCard` tiles
  (actual content miniature via `PagePreviewThumb`).
- Header chrome uses the flat `--sd-*` language (`--sd-line`, `--sd-box`,
  `--sd-hover`) with 6px radius buttons; matches the Explorer top bar.
- Same data flow: unchanged TanStack queries (`pages`, `page_folders`,
  `folder_projects`, `projects`), realtime subscriptions, and pruning helper
  (`pruneTreeToProject`).
- Selection: click-to-highlight with cyan border/bg.
- Context menus: reuses `ExplorerItemContextMenu` for Open / Rename / Delete.
- Navigation: folder click → `/wiki?folder=<id>` (opens Explorer at that
  folder); page click → `/wiki/<pageId>`.
- Motion: `AnimatePresence` + Motion 12 with `useReducedMotion` gate and the
  10ms staggered fade-up (cap 24 items) per the Motion Doctrine.
- Empty state: dashed panel with dimensional folder icon, editorial serif
  copy, both New page + New folder actions.
- Rename dialog reuses `WikiFolderNameDialog`; new-folder auto-links to this
  project.

DnD (bonus per brief §1) was intentionally skipped.

### 2. Page detail — width + chrome

`apps/web/components/pages/PageDetailClient.tsx`:

- `max-w-3xl` → `max-w-4xl` (line 660). Editor's inner measure stays comfortable.
- Breadcrumb row restyled with flat `--sd-*` language: each ancestor folder
  segment is now a live link back to `/wiki?folder=<id>`, so leaving a page
  returns the user to the exact Explorer folder they came from (satisfies the
  SPEC's "round-trips back to the right folder" criterion). Project pill uses
  `--sd-darker-box` with a cyan hover-border.
- Sticky per-doc action bar moved from `--edge`/`--canvas` to `--sd-line`/
  `--sd-darker-box` with 6px radius and a hairline shadow — reads as tooling
  (flat), not editorial (glass).

### 3. Touchpoint sweep (all verdicts: OK, no fixes needed)

Delegated to an Explore agent; verdicts:

- `components/shell/SidebarTree.tsx` — OK. Only emits area/project routes.
- `components/shell/TopTabBar.tsx` — OK. Today link → `/wiki/${today.id}` (L114).
- `components/shell/GlobalHotkeys.tsx` — OK. Quick-create → `/wiki/${id}` (L51).
- `components/shell/DailyAutoOpen.tsx` — OK. Auto-open → `/wiki/${id}` (L36).
- `components/shell/useQuickCreateActions.tsx` — OK. New page → `/wiki/${id}` (L67).
- `lib/search/snapshot.ts` — OK. Pages in snapshot (L62–69) via `entityHref`.
- `components/people/PersonDetailPanel.tsx` — OK. Back-refs → `/wiki/${fromId}` (L212).
- `app/api/cron/wiki-backup/route.ts` — OK. Reads current `pages` shape.
- `packages/personal-context-mcp/src/types.ts` — OK. Page schema (L92–107) aligned.
- `lib/jarvis/invoke-in-document.ts` — OK. Receives `pageId`, resolves scope.

### 4. Dev-scaffold cleanup

Deleted (510 LOC of scaffolding):

- `apps/web/app/(app)/wiki/foundation-preview/{page,FoundationPreviewGallery}.tsx`
- `apps/web/app/dev/wiki-preview-gallery/page.tsx`

### 5. Polish sweep

`focus-visible:` cyan indicators added across the Explorer chrome: `ExplorerTopBar`
nav buttons, `ViewToggle`, `ExplorerBreadcrumbs` segments, `ExplorerGridView` tiles,
`ExplorerListView` rows. Keyboard navigation now reads as clearly as pointer
interaction; the accent restraint rule holds (cyan for selection + focus, nothing
else).

Reduced motion already respected across `ExplorerGridView`, `InspectorShell`, and
the new `ProjectPagesSection`. Global scrollbar styling (`globals.css:459`) applied
to `html` + `*` — new grids inherit. Light-mode `--sd-*` tokens at `globals.css:1363-1373`
mirror the dark ladder; new surfaces read in both themes.

## Verification

- `pnpm --filter web build`: **green**. Route table shows only `/wiki` and
  `/wiki/[pageId]` — no more `/wiki/foundation-preview` or `/dev/*` leaks.
- `tsc --noEmit`: **green** (0 errors).
- Playwright: deferred (coherence-only sweep adds no new flows to drive).

## Commits (this unit)

1. `7483c98f` refactor(projects): rebuild ProjectPagesSection on new explorer primitives
2. `0194572c` refactor(wiki): page detail widens to max-w-4xl + chrome-coherent header
3. `24c68335` polish(wiki): focus-visible cyan rings across explorer chrome
4. `8f05c39a` chore(wiki): delete wave-1 dev-scaffold preview routes

## Follow-up: WikiExplorer split

Split `apps/web/components/wiki/WikiExplorer.tsx` (was 785 LOC) into two co-located
sub-components + three hooks, zero behavior change (same props, same exports, same
`DndContext` structure):

- `explorer-parts/ExplorerHeaderControls.tsx` (139 LOC) — topbar, breadcrumbs, search,
  view toggle, sort select, inspector toggle, plus the `BreadcrumbDroppable` wrapper.
- `explorer-parts/ExplorerCanvasBody.tsx` (196 LOC) — canvas div, rubber-band overlay,
  search/empty/grid/list branches, plus the `ReorderPageWrapper` droppable.
- `explorer-hooks/useExplorerActions.ts` — open/create/delete/rename handlers +
  rename & new-folder dialog state.
- `explorer-hooks/useExplorerDnd.ts` — dnd active id, drag bag, active label, and
  drag start/end/cancel handlers.
- `explorer-hooks/useExplorerKeyboard.ts` — `/`, `Cmd+A`, `Cmd+I`, `Esc`, `Enter`,
  and arrow-nav effect (owns `gridColumnCount`).

Result: `WikiExplorer.tsx` = 372 LOC, both subs < 400 LOC. `pnpm --filter web
typecheck` clean; `tests/wiki-explorer-helpers.test.ts` 17/17 green.
