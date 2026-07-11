# Wiki Explorer Redesign — "Actually Spacedrive, Actually Drive"

**Author:** Fable (Conductor). **Executor:** Codex `gpt-5.6-sol`, reasoning effort high.
**Verdict on current state (user, verbatim):** "it doesn't feel like spacedrive at all… the UI you did sucks… cannot drag and drop, cannot add folders, nothing."

Two independent failures, both must be fixed:
1. **Visual**: the current `--sd-*` styling is a pale approximation. Rebuild the chrome to genuinely read as Spacedrive (see §2 + `.planning/SPACEDRIVE-TOKENS.md` for real values pulled from their OSS repo).
2. **Functional**: the Explorer must operate like Google Drive. Today drag-and-drop and folder creation do not work in practice (root causes in §3).

Reference material:
- Two Spacedrive marketing screenshots (Overview + Projects grid) — summarized in §2.
- User's Google Drive screen-recording spec notes: (a) **subfolders on top, loose docs on bottom** in every directory listing; (b) **drag and drop must work for both docs and subfolders**.
- https://v2.spacedrive.com/overview/introduction and github.com/spacedriveapp/spacedrive.

## 1. Behavior contract — "operates like Google Drive"

These are acceptance criteria. Every one must demonstrably work in a real browser.

### 1.1 Sort & layout
- B1. Within any folder (including root), **folders render first (top of grid), pages after (below)** — two visually distinct bands are acceptable (Drive uses a "Folders" row then "Files"), or one grid with folders strictly before pages. Never interleaved.
- B2. Within each band, the active sort (name / recency / manual) applies; manual `position_key` ordering only reorders *within* its band.

### 1.2 Folder creation
- B3. A **visible "New" affordance in the top bar** (Drive's `+ New` button) with a menu: New folder / New page. Always present, never hidden behind hover.
- B4. Right-click on empty canvas → context menu with New folder / New page. Must work on first attempt.
- B5. New folder: inline-name dialog or inline-editable tile; on confirm, the folder appears in the current directory immediately (optimistic), correctly parented to the folder being viewed.
- B6. New page created inside the current folder (parented), not at root.

### 1.3 Drag and drop (the heart of it)
- B7. **Pages and folders are both draggable.** Drag starts after a small pointer-distance threshold (~6px) so plain clicks still select and double-clicks still open. If any handler (click-to-select, double-click-to-open, link navigation) currently swallows `pointerdown` before dnd-kit's sensor sees it, restructure so the sensor gets it first.
- B8. Drop targets: (a) any folder tile in the grid/list, (b) any breadcrumb segment (move to ancestor), (c) sidebar-visible folder targets if trivially reachable — (a) and (b) are mandatory.
- B9. While dragging: a drag ghost/overlay with the item name (multi-select shows a count badge); the hovered drop target highlights unmistakably (accent ring + bg tint).
- B10. Drop = move: page→folder sets `folderId`; folder→folder reparents (cycle-guarded — dropping a folder into its own descendant is rejected with a visible shake/denial, not a silent no-op). Optimistic update + server action + invalidation already exist in `useExplorerMutations` — wire them so they actually fire.
- B11. Multi-select drag: dragging one of N selected items moves all N.
- B12. After ANY drop, the item visibly leaves the current listing (or reorders) within 200ms. No refresh needed.

### 1.4 Table stakes (verify still work after the restyle)
- B13. Double-click folder → drill in (URL `?folder=`); double-click page → open `/wiki/<id>`.
- B14. Click = select; Cmd/Ctrl-click = toggle; Shift-click = range; rubber-band select on empty canvas; Esc clears.
- B15. Context menu on items: Open / Rename / Delete (+ Move to… optional).
- B16. Browser Back/Forward keep working through folder navigation (regression guard: `useExplorerFolder` history sync tests must stay green).

## 2. Visual contract — genuinely Spacedrive

Authoritative token values: `.planning/SPACEDRIVE-TOKENS.md` (real values from the Spacedrive repo). What the two reference screenshots show, translated to requirements:

- V1. **Near-black canvas** with a clearly darker sidebar; cards/tiles sit on a subtly lighter box color with hairline borders. The current wiki chrome must adopt this ladder exactly (replace the guessed `--sd-*` values with the dossier's real ones; keep the CSS-variable indirection).
- V2. **Spacedrive accent blue** for selection rings, drop-target highlights, primary buttons, active pills. (App-wide `--hud-cyan` stays elsewhere; inside the Explorer surface the Spacedrive blue is the accent. If this conflicts with the one-accent doctrine, scope the blue strictly to the Explorer chrome via a wrapper class.)
- V3. **Dimensional icons**: folders are the colorful 3D-front-flap folder (we already have `FolderIcon`; upgrade fidelity per dossier notes — gradient body, darker front flap, subtle drop shadow, ~72–80px in grid). Pages get per-kind document glyphs (generic doc, image thumb, etc.) in the Spacedrive document style with a colored badge/glyph, not flat lucide icons at grid scale.
- V4. **Grid tiles**: icon centered, name beneath (13px, single-line ellipsis), muted size/meta caption under the name (page count for folders, "Page" or last-edited for pages). Selection = accent border + translucent accent fill, rounded ~8px.
- V5. **Top bar**: left back/forward chevron pair (functional against the folder history), breadcrumb path, right icon cluster (search, view toggle grid/list, sort select, inspector toggle) as compact icon buttons in a bordered pill group — matching screenshot 1's top-right cluster.
- V6. **Inspector** (right panel): preview block up top, name + kind line, then sectioned metadata exactly in the screenshot's register — uppercase micro-labels (DETAILS / DATES), label-value rows, hairline dividers.
- V7. Typography, radii, spacing, hover states per dossier. Motion: subtle (Spacedrive is calm) — 120–160ms fades, no springy theatrics; respect reduced-motion.
- V8. The **Journal rail keeps its editorial glass register** (it is intentionally NOT Spacedrive); only the Explorer surface below it is restyled.

## 3. Known root causes (from live diagnosis)

### 3.1 Live-browser diagnosis findings (fix each specifically)

1. **No "New folder" affordance in the toolbar.** `ExplorerHeaderControls.tsx:91-99` renders only "New page". Folder creation exists solely via right-click on empty canvas — invisible to users. → B3 (a permanent `+ New` split-button/menu: New folder / New page) is the fix.
2. **Right-click dead zone.** In the lower region of the canvas, overlaid fixed elements (e.g. the "Enter the Studio" button / bottom overlays) swallow the context-menu event, so even the hidden affordance appears dead. → Ensure the canvas context-menu works across its full area; raise canvas min-height so the empty region is generous, and verify no app-shell overlay intercepts clicks over the Explorer.
3. **Silent drop failures.** ~1 in 5 drags ended with `over === null` at `useExplorerDnd.ts:65` — drop does nothing, zero feedback. → Never fail silently: if a drag ends without a valid target, animate the item back; if a move mutation errors, show a toast. Also widen droppable hit areas (folder tiles + breadcrumbs) with generous collision detection (`pointerWithin` or `rectIntersection` tuned).
4. **Hydration mismatch persists** in grid tiles: `aria-describedby` DndDescribedBy-0 vs -10, despite the stable `DndContext id`. → Eliminate entirely (likely each `useDraggable`/`useSortable` consumer needs deterministic ids, or the tiles' render order differs server/client; find and fix root cause).
5. **DnD + folder-create data paths are otherwise sound** (server actions persist correctly on :3000). Do not rebuild the data layer; fix UX, discoverability, feedback, and looks.

### 3.0 Confirmed: rectangular halo behind FolderIcon (user screenshot, light theme)
`components/wiki/icons/FolderIcon.tsx:52` — the `feDropShadow` filter region is hard-clipped (`x="1" y="8" width="78" height="68"`), so the dy=8/stdDeviation=7 dark blur crops into a visible gray rectangle on light backgrounds. Fix in the rebuilt icon: generous percentage-based filter region (e.g. `x="-25%" y="-25%" width="150%" height="160%"`) or a CSS `filter: drop-shadow(...)` on the `<svg>`, and make the shadow color/opacity theme-aware so it reads on both light and dark canvases.

## 4. Architecture constraints

- Work in branch `bgsd/wiki-drive-fidelity` off `staging`, worktree `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.claude/worktrees/wiki-staging`.
- Keep the existing component decomposition (`WikiExplorer.tsx` + `explorer-parts/` + `explorer-hooks/` + `explorer-views/`); no file may exceed ~400 LOC.
- Keep existing server actions (`app/actions/ordering.ts`) and TanStack Query keys; the data layer is sound — the wiring/UX is what's broken.
- `pages.dailyDate` pages stay excluded from the Explorer (Journal rail owns them).
- Do not touch `drizzle/` migrations; no schema changes are needed.
- Atomic commits, one per logical slice, explicit pathspecs.

## 5. Verification (must all pass before claiming done)

- `pnpm --filter web exec tsc --noEmit` clean; `pnpm --filter web build` green.
- `vitest run apps/web/tests/wiki-explorer-helpers.test.ts apps/web/lib/pages/` green (22 + 17 existing cases; extend for new sort-banding logic).
- Playwright-driveable checklist: B1, B3–B5, B7–B10, B12, B13, B16 each demonstrated against localhost.
