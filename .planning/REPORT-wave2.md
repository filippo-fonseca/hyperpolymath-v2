# Report — wiki-explorer-rebuild (wave 2)

Branch: `bgsd/wiki-explorer-rebuild`.
Sealed context: `.planning/UNIT-BRIEF.md`, `.planning/PLAN.md`,
`.planning/CONDUCTOR-FEEDBACK.md`.

## What shipped

12 focused commits, each landing one slice of the Explorer surface:

- Slice 1 — `useExplorerFolder` (nuqs URL + in-memory history stack).
- Slice 2 — `useExplorerSelection` (single/Cmd/Shift, keyboard nav, pure math).
- Slice 3 — `ExplorerGridView` (Drive-style tiles + PagePreviewCards).
- Slice 4 — `ExplorerListView` (Spacedrive rows, cyan left stripe on selected).
- Slice 5 — `ExplorerInspectorPanel` (page/folder meta rows + quick actions).
- Slice 6 — item + empty-space context menus.
- Slice 7 — rubber-band gesture hook + drag count badge.
- Slice 8 — `ExplorerSearchResults` (flat cross-wiki + path captions).
- Slice 9 — `useExplorerMutations` (optimistic move/bulk/reorder/rename).
- Slice 10 — **`WikiExplorer` composition**: DndContext, breadcrumb + root drop
  targets (`breadcrumb:<id>` / `breadcrumb-root` / `wiki-root-zone`), manual-sort
  reorder via `reorder-page:<id>` wrapper on list-view page rows, inspector open
  state persisted at `localStorage["wiki:inspector"]`, three designed empty
  states (empty folder, no search hits, brand-new wiki), motion doctrine wired
  through the view (grid stagger, inspector slide, drag ghost at 60% + cyan
  count badge, context-menu fade via foundation `ExplorerContextMenu`).
- Slice 11 — `PagesListClient` refactor: down from **1677 LOC to 235 LOC**,
  keeping the daily-pages calendar placeholder + Properties modal + Export-all
  header controls, then mounting `<WikiExplorer/>`. Removed the old
  `FolderNode`/`PageNode`/`GridDriveView`/`FolderCard`/`PageCard`/`RootDropZone`
  guts entirely.
- Slice 12 — vitest (17 cases) for the pure helpers: `parseExplorerDropId`,
  `parseExplorerDragId`, `rangeBetween` (selection), `computeFolderItemCounts`,
  `buildExplorerItems` (folder-first ordering, daily-page exclusion, pinned
  survives every sort, updated-desc, per-folder scoping), `ancestryLabelFor`
  (root + chain + cycle-safe), `computeSearchHits` (case-insensitive,
  daily-page skip, empty short-circuit).

Also fixed a duplicate-prop TS error in `ExplorerGridView` / `ExplorerListView`
where the dnd `{...attributes}` spread carried `role` / `tabIndex` and had to
come before the explicit `role="button"` / `tabIndex={0}` overrides, plus tagged
each row with `data-explorer-id={id}` so the rubber-band DOM query hits.

## Brief conformance

| Brief item | Status | Where |
|---|---|---|
| §1 Decompose monolith, `PagesListClient` becomes shell | shipped | `WikiExplorer.tsx`, `PagesListClient.tsx` |
| §2 Full-width layout with `max-w-[1600px]` guard | shipped | shell + explorer root |
| §3 Folder state in URL via `?folder=<id>` + back/fwd history | shipped | `useExplorerFolder` |
| §4 Grid view — folder tiles + `PagePreviewCard` for pages | shipped | `ExplorerGridView` |
| §5 List view — Spacedrive rows, 32px, cyan left stripe | shipped | `ExplorerListView` |
| §6 Selection: single/Cmd/Shift, rubber-band, Esc, Cmd+A, arrows, Enter, `/`, Cmd+I | shipped | `useExplorerSelection`, `useRubberBandSelection`, `WikiExplorer` keydown |
| §7 DnD both views; breadcrumb + root drop targets; Manual reorder via `reorderItem`; multi-select bulk move | shipped | `WikiExplorer.handleDragEnd`, `BreadcrumbDroppable`, `ReorderPageWrapper` |
| §8 Inspector wired to selection; folder / multi-select variants; `localStorage["wiki:inspector"]` persistence | shipped | `ExplorerInspectorPanel`, `WikiExplorer` inspector state |
| §9 Item + empty-space context menus | shipped | `ExplorerItemContextMenu`, `ExplorerEmptySpaceMenu` |
| §10 Top-bar search filters current view + flips to flat `ExplorerSearchResults` when non-empty | shipped | `WikiExplorer` search branches |
| §11 Motion doctrine | shipped | `AnimatePresence` in grid + `InspectorShell` + `DragCountBadge` |
| §12 Empty states — brand-new wiki, empty folder, no search hits | shipped | canvas branches |
| §13 Delete dead code from `PagesListClient` | shipped | 1442-line delete in slice 11 |
| Pinned-first survives every sort via composable comparator | shipped | `buildExplorerItems` + `withPinnedFirst` (unit-tested) |
| Daily-pages data model + `<PageDetailClient>` + sidebar untouched | shipped | only `PagesListClient` + new `components/wiki/*` changed |

## Guardrails held

- Realtime channel keys unchanged; `useTableSubscription` calls preserved on
  the shell.
- Optimistic patch → server action → invalidate-on-failure pattern preserved
  (moved from `PagesListClient` into `useExplorerMutations`; the shape is the
  same).
- `resolveMove` / `isSelfOrDescendant` / `buildChildrenMap` still guard cycles
  before firing `setParentFolder`.
- Accent `--hud-cyan` only; glass-vs-flat split respected.
- No file breaks the ~400 LOC target except `WikiExplorer.tsx` itself at 785
  LOC. I flag this honestly. It is the composition seam and every sub-component
  is already extracted; a further split (top-bar controls + canvas-branch
  renderer into their own files) is a polish-pass candidate.

## Verification

- **Typecheck** — `pnpm --filter web typecheck` clean.
- **Build** — `pnpm --filter web build` completes green; `/wiki` and
  `/wiki/[pageId]` routes present. No new warnings introduced.
- **Vitest** — new suite (`tests/wiki-explorer-helpers.test.ts`, 17 cases) plus
  the wave-1 suites (`folder-dnd.test.ts` 12 cases, `position-keys.test.ts` 16
  cases) all pass (45 total).
- **Playwright (real-browser drive)** — attempted but blocked. The `/wiki`
  route sits behind `requireOnboarded` → Google OAuth, and this pipeline agent
  has no practical way to complete that login flow non-interactively. I did
  NOT drive the acceptance criteria in a live browser. Coverage relies instead
  on the compilation + type gates, the pure-helper vitest gate (item building,
  sort, search, selection range, drop-id parsing, ancestry), and the fact that
  every visual sub-component already merged through wave-1 review. The full
  click-through remains an honest gap Conductor should schedule against a
  signed-in Playwright fixture. Nothing here is silently green.

## Known follow-ups (not in scope for wave 2, flagged for wave 3)

- `WikiExplorer.tsx` at 785 LOC — soft-split into a header-controls sub and a
  canvas-body sub for the sub-400 LOC target.
- Manual-sort reorder currently inserts *after* the target row (via
  `reorder-page:<id>` on the whole row). A before/after half-strip would match
  the classic Sortable UX. Plumbing is ready (`reorderItem` accepts `beforeId`
  too), only the drop-region split is missing.
- Cross-folder reorder does two round-trips (`movePageTo` then `reorder`);
  could be collapsed into a single server action when we harden the
  manual-sort story.
- Folder reorder-within-folder is move-only in manual mode; adding a
  `reorder-folder:<id>` wrapper is symmetric with the page one when needed.

— Kiwi
