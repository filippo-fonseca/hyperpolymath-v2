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
