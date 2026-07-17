# u3-timeline-core — control report

VERDICT: PASS — timeline UI + /areas by-date view delivered to the sealed contract; both gates green (tsc clean, 97 vitest tests pass), §23 compiled-CSS proof current, real light+dark evidence at every state + mobile/tablet; the one responsive gap (mobile shell sidebar does not collapse) is out-of-unit and logged.

SUMMARY:
- Build was complete at resume (13 commits through da86389f); this pass ran the verification endgame + a user-directed responsive amendment that landed mid-run.
- Gates PASS from apps/web: `npx vitest run <4 new test files> lib/projects/__tests__/timeline.test.ts` → 5 files / 97 tests pass; `npx tsc --noEmit` → exit 0. Re-run green after the responsive fix.
- §23: the edge-fade / bar-fade / scrollbar-hidden utilities survive the Oxide scan in the current production build (chunk `06r4bkww7y05j.css`); proof file refreshed post-fix.
- Evidence was regenerated wholesale: the prior dark shots were byte-identical to light (the capture rig wrote the wrong theme key — `theme` instead of next-themes' `hyperpolymath-theme`), and ghost shots showed no ghosts. All 20 PNGs are now real, distinct, and theme-correct.
- Evidence captured against a PRODUCTION build (`next start`): `next dev --turbopack` would not hydrate in this environment (HMR WebSocket ERR_INVALID_HTTP_RESPONSE), so the /areas toggle/effects were inert under dev. Prod hydrates cleanly (verified: toggle flips, 5 bars, today marker, scroller).
- Responsive amendment (advisor 16:09Z): audited at 390px + 768px. Zero page-body horizontal overflow at both; popover clamps in-viewport; sticky headers + today marker correct; scroller contains the canvas. Applied a minimal flex-wrap fix so the toolbars wrap instead of clipping — tablet is now fully unclipped.
- Ghost feature confirmed working: clicking Show archived flips 5→7 bars with 2 `data-ghost` bars (Old Seminar, Archived Lifting Cycle). It is NOT settable via localStorage (a mount-time mirror-write resets the shared tree key to "false"), so it must be toggled by click — noted under DEFECTS.
- getSidebarTree widening (c395ab5f) confirmed additive/non-breaking: `SidebarArea` gains `createdAt: Date`; `SidebarProject` shape unchanged; all consumers read-only; `sidebar-no-refetch.test.tsx` green (in the 97).
- No drag logic added. Bars expose clean data-attr/ref seams for u4 (see API NOTES). DESIGN-SYSTEM.md honored; ISO-string math only; engine consumed, never re-derived.

PLAN:
See `.planning/PLAN.md` (committed). Shape delivered as sealed: (1) globals.css fade/scrollbar utilities; (2) `useTimelineView` persistence; (3) `TimelineZoomToggle` + Today; (4) `TimelineHeader` two sticky tiers; (5) `TimelineBar` fades/ghost/label-overflow/drag-seams; (6) `TimelineGroup` lanes; (7) `ProjectBarPopover` link + dates + archive-trap + undo toast; (8) `ProjectsTimeline` composition; (9) /areas tree|timeline toggle + data wiring + realtime alsoInvalidate; (10) component tests; (11) evidence + docs. Responsive flex-wrap hardening added per the mid-run DESIGN amendment.

COMMITS:
2033a9da docs(planning): refresh §23 compiled-CSS proof for post-fix build
60c727af docs(planning): u3 responsive evidence (mobile 390px + tablet 768px, both themes)
580fb01c fix(timeline): wrap toolbars at narrow widths instead of clipping
e4507e18 docs(planning): DESIGN.md responsive contract amendment (user-directed)
b86e0832 docs(planning): retarget planning docs to u3 + import u1 engine report
c73c9077 docs(planning): u3 evidence screenshots + compiled-css proof
da86389f test(timeline): type the updateProject mock so tsc covers the call assertion
88841a6a test(timeline): cover persistence, render contract, and the archive trap
29a7d4f1 feat(areas): tree|timeline view toggle with realtime date wiring
c395ab5f feat(areas): expose area createdAt from getSidebarTree
080422fd feat(timeline): compose scroller, header, groups, today marker
96d94ae4 feat(timeline): area group rows with lanes
69386946 feat(timeline): bar popover with project link, date editing, archive trap
fcf99940 feat(timeline): project bar with terminus fades, ghost, label overflow
f69f81a8 feat(timeline): two sticky date header tiers
7af1586d feat(timeline): Weeks/Months/Quarters segmented control plus Today button
a9f612dc feat(timeline): useTimelineView persistence hook
c3666565 feat(timeline): edge-fade and bar-terminus fade utilities

GATES:
- `npx vitest run tests/projects-timeline-archive-trap.test.tsx tests/projects-timeline-render.test.tsx tests/projects-timeline-view-persistence.test.ts tests/sidebar-no-refetch.test.tsx lib/projects/__tests__/timeline.test.ts` (from apps/web) → PASS (5 files, 97 tests; re-run green after the responsive fix)
- `npx tsc --noEmit` (from apps/web) → PASS (exit 0; re-run green after the responsive fix)
- §23 compiled-CSS survival → PASS (all of .timeline-edge-fade / .timeline-bar-fade-{r,l,lr} / .scrollbar-hidden present in current prod chunk `06r4bkww7y05j.css` with masks intact; proof committed)
- Repo-wide vitest is NOT a gate (31 pre-existing jarvis/voice failures at base — Conductor ruling; not touched).

EVIDENCE (all committed under .planning/evidence/):
- u3-timeline-weeks-{light,dark}.png, u3-timeline-months-{light,dark}.png, u3-timeline-quarters-{light,dark}.png — three zooms, both themes (sticky two-tier headers, cyan bars, open-ended fade, today marker, empty Reading lane)
- u3-timeline-ghosts-{light,dark}.png — Show archived on; 2 reduced-opacity ghost bars (Old Seminar, Archived Lifting Cycle)
- u3-timeline-popover-{light,dark}.png — popover with project title + start/end date form + Save
- u3-timeline-archive-trap-{light,dark}.png — past end date triggers the amber "…archives Senior Thesis… Cancel / Archive anyway" confirm (captured WITHOUT confirming; no commit fired — verified Senior Thesis end unchanged in DB)
- u3-timeline-empty-{light,dark}.png — "No active projects" panel with the zoom toolbar still present
- u3-areas-tree-view-{light,dark}.png — tree view showing the TREE|TIMELINE toggle
- u3-timeline-mobile-{light,dark}.png (390px), u3-timeline-tablet-{light,dark}.png (768px) — responsive
- u3-timeline-compiled-css-proof.txt — §23 proof (current build)

API NOTES (BINDING for u4 drag + u5 area-detail scope="area")

1) ProjectsTimeline props (`components/projects/timeline/ProjectsTimeline.tsx`):
   `{ areas: TimelineAreaInput[]; projects: TimelineProjectInput[]; showArchived: boolean; scope: "all" | "area"; toolbarSlot?: ReactNode }`.
   Types from `@/lib/projects/timeline`. `scope` ONLY toggles group headers: it is passed as `showAreaHeader={scope === "all"}` to each `TimelineGroup`. `scope="area"` (u5) drops the per-area label rows; nothing else branches on it. There is NO `areaId` prop — u5 pre-filters `areas`/`projects` before passing them in. Window/geometry are derived from `visibleProjects` (post show-archived filter) so a hidden ghost never stretches the canvas.

2) TimelineBar drag seams (`TimelineBar.tsx`) — this is what u4 hooks onto:
   The bar is a single `<button>`, `forwardRef<HTMLButtonElement>` (ref → that button). Attributes: `data-timeline-bar` (selector), `data-project-id={id}`, `data-bar-left-px={geometry.leftPx}`, `data-bar-width-px={geometry.widthPx}`, and boolean-when-true `data-ghost` / `data-open-ended` / `data-corrupt` (rendered via `|| undefined`, so absent === false). Position is inline `style.left/width/height`; the `data-bar-*-px` attrs mirror the engine geometry so the drag layer reads pixels without redoing date math. Props: `{ project: TimelineRowProject; geometry: TimelineBarGeometry; isOpen: boolean; onOpen: (projectId: string) => void; heightPx: number }` — `onOpen` is the only callback (click → popover); NO drag/resize props exist yet, u4 adds them. `if (!geometry.visible) return null` (clamped-out bars render nothing). There is NO `data-testid` on the bar; select by `[data-timeline-bar]` / `data-project-id`. Row wrapper (TimelineGroup) carries `data-testid="timeline-row"` + `data-project-row-id={id}`. Exported helpers: `estimateLabelWidthPx`, `labelFitsInsideBar`.

3) useTimelineView (`useTimelineView.ts`): returns `{ view, setView, zoom, setZoom }`. `AreasView = "tree" | "timeline"`; `TimelineZoom = "weeks"|"months"|"quarters"`. Keys (exported): `VIEW_STORAGE_KEY="areas:view"` (default `"tree"`), `ZOOM_STORAGE_KEY="areas:timeline-zoom"` (default `"months"`). SSR-safe: `useState(DEFAULT)` + one mount effect that reads/validates (`isView`/`isZoom`) and reconciles; writes happen inside the setters (no mirror effect). All localStorage in try/catch; corrupt values fall back silently. NOTE: `showArchived` is NOT in this hook — it lives in `AreasPageClient` under `areas-tree-show-archived` (shared with the tree).

4) ProjectBarPopover (`ProjectBarPopover.tsx`): NOT a Radix trigger — `PopoverAnchor asChild` wraps the bar; open state is controlled by the parent (bar `onClick` drives it). Props: `{ project, open, onOpenChange, onCommitDates: (patch: TimelineDatePatch) => void, todayISO, children }`, `TimelineDatePatch = { startDate: string | null; endDate: string | null }`. Test ids: `timeline-bar-popover` (content), `timeline-start-input`, `timeline-end-input`, `timeline-save-dates`, `timeline-inverted-warning`, `timeline-archive-warning`, `timeline-archive-confirm`. The popover is pure: on save it calls `onCommitDates(patch)` and closes; it does NOT call updateProject. The parent `ProjectsTimeline.handleCommitDates` owns the deferred-commit undo path: optimistic override → `useUndoToast().show(...)` → `updateProject({ id, ...patch })` fires when the toast closes (Undo = never fires; failure reverts + toast.error). u4's drag commit MUST reuse this same `onCommitDates`/`handleCommitDates` seam. Archive-trap: `inverted = start && end && start > end` (string compare); `wouldArchive` only when the edit *creates* expiry (`isProjectExpired(patched) && !isProjectExpired(project)`); first save shows the warning, a second confirm commits.

5) TimelineGroup (`TimelineGroup.tsx`): `<div data-testid="timeline-group" data-area-id={id}>`. Area label row rendered only when `showAreaHeader` (sticky-left, emoji + name + count). Project rows: `data-testid="timeline-row"` + `data-project-row-id={id}`, height `TIMELINE_ROW_HEIGHT_PX=32`. Empty area → `data-testid="timeline-empty-lane"` ("No projects"). Exported: `TIMELINE_ROW_HEIGHT_PX=32`, `TIMELINE_BAR_HEIGHT_PX=14`, `TIMELINE_AREA_ROW_HEIGHT_PX=30`.

6) Empty states (`ProjectsTimeline.tsx`): `areas.length===0` → TimelineEmpty "No areas yet" (no toolbar). `visibleProjects.length===0` → zoom toolbar + TimelineEmpty ("No projects yet" when showArchived, else "No active projects"). `AreasPageClient` gates: timeline only renders when `view==="timeline"`; shows "Loading timeline…" while the projects `useQuery` is pending; `getProjectsForCurrentUser` returns ALL rows (no server-side archived/expired filter — the client engine does the ghost filtering).

7) Responsive: `ProjectsTimeline` toolbar rows and the `/areas` header row use `flex-wrap` + `gap-x/gap-y` so each control group wraps as a unit rather than clipping. The scroller (`data-testid="timeline-scroller"`, `.scrollbar-hidden .timeline-edge-fade overflow-auto`) is the horizontal release valve — page body never overflows at any width. u4 touch-drag must not hijack native scroller panning.

ASSUMPTIONS:
- Undo-toast idiom is DEFERRED-COMMIT (matching `use-undo-toast`): optimistic local override, server write fires on toast auto-close, Undo restores and never writes. Repo's existing contract for non-JARVIS CRUD.
- Label-overflow decision estimates label width from character count (no DOM measurement) — no layout thrash, unit-testable.
- Empty-state evidence was captured by deleting the SYNTHETIC local test user's (u3timeline@local.test) projects — throwaway seed data, not real data; areas kept so the "No active projects" panel renders with its toolbar. Data re-seeded afterward.
- Evidence captured against a production build because dev did not hydrate here; this is an environment property, not a product property.

DEFECTS/RISKS:
- MOBILE SHELL (out of unit scope, logged per advisor): the desktop sidebar (`components/shell/Sidebar.tsx`, ~230px) does not collapse at ≤390px, leaving ~160px for main, so the zoom segmented control (Quarters/Today) clips at 390px. The timeline component itself is responsive within its container (zero page-body h-overflow at 390/768, scroller contains the canvas, popover clamps, sticky headers correct; tablet 768px fully unclipped after the flex-wrap fix). Making the whole app shell mobile-progressive is a layout change outside this unit's touched paths and would be a fork/refactor the amendment forbids — deferred to a shell unit.
- `areas-tree-show-archived` is reset to "false" on mount by a mirror-write in the shared tree persistence, so Show archived does not persist across reload (must be re-toggled per session). Pre-existing shared-state behavior owned by the tree, not `useTimelineView`; the timeline reads it correctly within a session. Minor.
- getSidebarTree widening (c395ab5f): additive-only. Any hand-built `SidebarArea` literal (test fixtures / optimistic-create stubs) must now supply `createdAt`; query consumers are unaffected. No breakage found; `sidebar-no-refetch.test.tsx` green.
- ENVIRONMENT (not a product defect): `next dev --turbopack` fails to hydrate /areas here (HMR WebSocket ERR_INVALID_HTTP_RESPONSE); use `next build && next start` for evidence/manual verification in this worktree.
