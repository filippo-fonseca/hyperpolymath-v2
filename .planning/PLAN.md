# Plan — wiki-explorer-rebuild (wave 2)

Reference: `.planning/UNIT-BRIEF.md` (binding). Wave 1 foundations already in
place: `components/wiki/explorer/*`, `components/wiki/icons/*`,
`components/wiki/preview/*`, `lib/pages/preview.ts`, `lib/pages/position.ts`,
`app/actions/ordering.ts`.

## Approach

Introduce a `WikiExplorer` subtree under `apps/web/components/wiki/` that owns
folder drill-down, dnd, selection, keyboard, inspector, search, and view-mode
rendering. `PagesListClient` shrinks to header + daily placeholder + `<WikiExplorer/>`.
Reuse existing server actions and TanStack Query keys verbatim.

## File layout

```
apps/web/components/wiki/
  WikiExplorer.tsx                 top-level composition + DndContext
  explorer-hooks/
    useExplorerFolder.ts           URL folder state (nuqs) + back/fwd history
    useExplorerSelection.ts        single/cmd/shift + arrow-key navigation
    useExplorerContext.ts          memoized dnd context maps
  explorer-views/
    ExplorerGridView.tsx           folder tiles + PagePreviewCards
    ExplorerListView.tsx           Spacedrive rows
    ExplorerSearchResults.tsx      flat cross-wiki results
  explorer-parts/
    ExplorerInspectorPanel.tsx     inspector body (meta rows + actions)
    ItemContextMenu.tsx            item right-click actions
    EmptySpaceContextMenu.tsx      empty-space right-click
    RubberBandLayer.tsx            rubber-band gesture + geometry
    DragGhost.tsx                  count-badge drag overlay
```

Target: no file over ~400 LOC.

## Slices (each = one commit)

1. URL folder + history hook `useExplorerFolder`.
2. Selection hook `useExplorerSelection` (pure state + keyboard math).
3. Grid view (presentational).
4. List view (Spacedrive rows).
5. Inspector panel.
6. Context menus (item + empty space).
7. Rubber-band + drag-ghost.
8. WikiExplorer composition (DndContext, sensors, applyMove, keyboard).
9. Refactor PagesListClient to use WikiExplorer; delete dead tree/grid code.
10. Vitest tests for pure selection helpers.
11. Typecheck + build green.
12. `/gsd-code-review`.

## Data contracts (from survey)

- Server actions to reuse: `createPage`, `updatePage`, `deletePage`,
  `createFolder`, `renameFolder`, `deleteFolder`, `setPageFolder`,
  `setParentFolder`, `movePagesBulk`, `reorderItem`.
- Comparators: `withPinnedFirst(compareExplorerItems)` for Manual sort;
  Name = title asc; Updated = updatedAt desc. Pinned first ALWAYS.
- TanStack query keys unchanged; realtime channels unchanged; optimistic
  cache patching mirrors current `applyMove` shape.

## Motion (SPEC Doctrine-6)

- View toggle: 180ms fade + 4px Y stagger (cap 24 items).
- Inspector slide: 220ms `cubic-bezier(0.32, 0.72, 0, 1)` (already in
  `InspectorShell`).
- Context menu: 120ms fade + 4px Y.
- Selection ring: instant.
- Drag ghost: 60% opacity + cyan count badge.

## Out of scope (guardrails)

Daily-pages data model, `PageDetailClient`, `ProjectPagesSection`, sidebar,
schema, `_foundation-preview`/`_preview-preview` gallery routes (leave for
wave 3 coherence pass unless they conflict with routing).
