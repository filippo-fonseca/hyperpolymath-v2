# Unit brief — `wiki-explorer-rebuild` (wave 2 — the monster)

**Read first:** `.bgsd/runs/sesh-1783700667211/SPEC.md` (binding), then the three wave-1
units already merged into your base: `components/wiki/explorer/**` + `components/wiki/icons/**`
(foundation), `components/wiki/preview/**` + `lib/pages/preview.ts` (previews),
`lib/pages/position.ts` + `app/actions/ordering.ts` (ordering). Executor: Fable.

## Goal

Rebuild the Wiki home surface into the Explorer: full-width, Drive-style folder drill-down
with URL state, content-preview grid, Spacedrive list view, drag-and-drop EVERYWHERE,
multi-select, keyboard navigation, the Inspector, and the motion doctrine. This is the
flagship unit — it sets the precedent for the whole app. Cook.

## Current state (what you replace)

`apps/web/components/pages/PagesListClient.tsx` (1677 LOC) renders everything: header,
daily-pages collapsible (LEAVE the daily-pages data flow intact — wave 3 rebuilds that
section; keep a minimal placeholder rendering of it so nothing breaks, clearly marked),
filter input, dnd tree list view (`FolderNode`/`PageNode`/`RootDropZone`), and
`GridDriveView`/`FolderCard`/`PageCard`. Move logic: `apps/web/lib/pages/folder-dnd.ts`
(`resolveMove`, cycle detection — reuse/extend it, it's tested and pure). Data flow:
TanStack Query keys via `tableKey("pages"|"page_folders"|…, userId)`, realtime
invalidation, optimistic mutations (keep this pattern EXACTLY).

## Deliverables

1. **Decompose the monolith.** New `apps/web/components/wiki/WikiExplorer.tsx` (+ focused
   child files under `components/wiki/`) replacing the tree/grid guts of `PagesListClient`.
   `PagesListClient` shrinks to: header + daily placeholder + `<WikiExplorer …/>`. Target:
   no file over ~400 LOC.
2. **Layout:** drop `max-w-3xl` (SPEC §UX-Layout) → full width with `max-w-[1600px]` guard.
   Wiki H1 in Garamond stays.
3. **Folder model:** current folder in URL via `nuqs` `?folder=<id>` (NuqsAdapter already
   installed). Back/fwd buttons drive an in-memory history stack (and browser history works
   via URL). Breadcrumbs from folder ancestry; each segment + a root crumb are drop targets.
4. **Grid view:** `PagePreviewCard` for pages (REAL content previews), `FolderIcon` tiles
   for folders (item counts). Responsive columns (~200px min card). Daily pages excluded.
5. **List view:** Spacedrive rows of the CURRENT folder (not the old whole-tree): Name
   (icon+text) · Kind · Updated · Projects. 32px rows, header row uppercase faint, selected
   = `--sd-selected` + 2px cyan left stripe. The old expandable whole-tree dies (sidebar
   tree still exists app-wide).
6. **Selection engine:** single/Cmd/Shift-range; rubber-band on empty space (foundation's
   `SelectionRubberBand`); Esc clears; Cmd+A all; arrow keys navigate (2-D grid aware);
   Enter opens; `/` focuses search; Cmd+I toggles inspector. A `useExplorerSelection` hook,
   unit-tested where pure.
7. **DnD (dnd-kit), both views:** drag pages/folders (multi-select drag with count-badge
   ghost at 60% opacity) onto folder tiles/rows, breadcrumb segments, root crumb. Reuse
   `resolveMove` for validity/cycles. Sort=Manual enables reorder-within-folder in list
   view via `reorderItem`; other sorts (Name/Updated) move-only. Server: `setPageFolder`,
   `setParentFolder`, `movePagesBulk`, `reorderItem` — all optimistic with the existing
   cache-patch pattern.
8. **Inspector:** `InspectorShell` wired to selection — large `PagePreviewThumb`, MetaRows
   (Kind, Location breadcrumb, Words via preview model, Created, Updated, Projects, custom
   field values if cheap), quick actions (Open, Rename, Move…, Export, Delete). Folder
   selection shows folder meta (items, created). Multi-select shows count + total summary.
   Persist open/closed in `localStorage["wiki:inspector"]`.
9. **Context menus:** items (open, open in new tab, rename, move to…, export, delete —
   reuse the action set from `WikiPageMenu`/`WikiFolderMenu`) and empty-space (new page
   here, new folder, paste — skip paste if no clipboard concept). Use foundation's
   `ExplorerContextMenu` styling.
10. **Search:** the top-bar search filters the CURRENT view live and (when text present)
    switches to a flat "results across wiki" mode with folder-path captions.
11. **Motion:** SPEC §Doctrine-6 exactly. View-mode crossfade + stagger, inspector slide,
    context menu fade, instant selection. No scale on tiles.
12. **Empty states:** empty folder, no search hits, brand-new wiki — all designed
    (foundation `EmptyState`).
13. **Cleanup:** delete dead code from `PagesListClient` (old tree/grid components) once
    replaced; delete wave-1 `_foundation-preview` / `_preview-preview` galleries if they
    conflict with routing (else leave for wave 3 coherence-pass).

## Guardrails

- Do NOT touch: daily-pages data model/queries, `PageDetailClient`, `ProjectPagesSection`
  (wave 3), sidebar, schema.
- Keep `pinned` behavior: pinned pages sort first within a folder (composable comparator
  from ordering-backend).
- Realtime invalidation keys unchanged; optimistic pattern preserved on every mutation.
- Accent = `--hud-cyan` only; glass-vs-flat split per SPEC §Doctrine-3.

## Acceptance criteria

- Full flow works in the real browser (Playwright): drill into folders (URL updates, deep
  link works on reload), back/fwd, switch views, see real content previews, rubber-band +
  Cmd multi-select, drag 2 pages into a folder (optimistic + persisted), drag onto
  breadcrumb, reorder in Manual sort, inspector opens with correct meta, context menu
  rename works, keyboard nav opens a page with Enter.
- Build + typecheck + vitest green; zero console errors during the driven flow.
- No file > ~400 LOC in the new explorer tree.
