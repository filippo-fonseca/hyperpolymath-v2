# Conductor seed — u3-timeline-core (from Kiwi/Fable)

Read `.planning/DESIGN.md` (sealed contract — the visual/interaction law),
`.planning/scout-ui-report.md`, `.planning/scout-data-report.md`, and
**`.planning/u1-engine-report.md`** (the engine you build on — its API
DEVIATIONS section is binding). Stale sd-era planning docs may linger in
`.planning/`; anything not named in this paragraph is NOT yours.

## The engine contract (u1, already merged into your base)
`apps/web/lib/projects/timeline.ts` is done, tested (71 tests), and verified.
Consume it; do not reimplement date math. Key deviations from the original seed
(full list in u1-engine-report.md):
- `markCurrentColumn(columnsForWindow(w, zoom), todayISO)` — isCurrent is not
  stamped by columnsForWindow.
- Two tiers: `columnsForWindow` = MINOR grid tier; `headerGroupsForWindow` =
  MAJOR tier. They do not nest; each is positioned via its own leftPx/widthPx.
- `TimelineWindow.totalWidthPx`, `TimelineColumn.leftPx/widthPx` — do not re-derive.
- `TimelineBarGeometry.clampedEnd` (right fade for off-window real ends) and
  `visible:false` (skip render entirely).
- Ghosts: `groupByArea` returns `TimelineRowProject { ...p, isGhost }`.
- `todayOffsetPx(w, todayISO)` for the marker (null = today off-window; hide it
  and let the Today button scroll to window edge sensibly).
- `useMemo` around `computeWindow`/`columnsForWindow` — engine is pure but O(n).
- `ZOOM_PX_PER_DAY` (weeks 28 / months 8 / quarters 3) is engine taste; if the
  design needs retuning, change it IN THE ENGINE (one place) and rerun its tests.

## Component architecture (directive)
```
apps/web/components/projects/timeline/
  ProjectsTimeline.tsx      composition: scroller + headers + groups + marker
  TimelineHeader.tsx        two sticky tiers (major groups over minor columns)
  TimelineGroup.tsx         area section: label row + project rows
  TimelineBar.tsx           one bar: fades, ghost, label overflow, focus ring
  TimelineZoomToggle.tsx    Weeks/Months/Quarters (DayWeekToggle SEGMENTS grammar)
  ProjectBarPopover.tsx     click popover: link, dates form, archive-trap warn
  useTimelineView.ts        areas:view + areas:timeline-zoom persistence (lifeos:view idiom)
```
Props for ProjectsTimeline: `{ areas, projects, showArchived, scope: "all" | "area" }`
— u5 will reuse it with scope="area" (no group headers); design for that now.

## Non-negotiables (from DESIGN.md — the verifier will check each)
- Today marker: 3px `--sd-accent` @ 70%, no halo/pulse. Sticky headers mono
  11px uppercase tracking-[0.1em] ink-faint, `tabular-nums`.
- Bars: accent fill, `--sd-input` lane track, pill/6px radius, border-only
  hover, `--sd-selected` + accent label chip when popover open. Ghost = reduced
  opacity, never grey gradient.
- Open-ended fade + clamped-edge fades: REAL classes in globals.css (§23 — no
  inline gradient overlays, verify the utility survives the Oxide scan in
  compiled CSS).
- Scroller: `.scrollbar-hidden`, wheel + trackpad horizontal, Today button
  centers today (CalendarGrid ResizeObserver idiom, scrollLeft).
- Label overflow: when a bar is narrower than its label, label sits OUTSIDE the
  bar to the right (Notion-style), clipped by the row, never wraps.
- Popover date edits go through `updateProject`; if a new end date < today,
  show the archive-trap confirm (the project will vanish from active lists);
  every commit gets the undo toast idiom (`components/shared/use-undo-toast`).
- View + zoom persistence per lifeos:view idiom exactly (SSR default, mount
  effect read, write in setter).
- /areas data: `getProjectsForCurrentUser` full rows + client-side sort
  (orderIndex, createdAt) + archived handling; DO NOT change that action's
  semantics. Wire `alsoInvalidate: [tableKey("areas", userId)]` on the projects
  subscription for date mutations.
- Reduced motion, both themes, §14 motion law (no width animation — zoom
  changes may re-layout instantly or scaleX-transition, never tween width).

## Test gate (repo suite is RED at base — Conductor ruling)
31 jarvis/voice failures pre-exist at base; `pnpm --filter web test` is NOT your
gate. Your gates, run verbatim:
- `npx vitest run tests/<your-new-test-files> lib/projects/__tests__/timeline.test.ts` (from apps/web)
- `npx tsc --noEmit` (from apps/web)
- engine tests must STAY green (you may retune ZOOM_PX_PER_DAY only via the engine)

## Evidence required (.planning/evidence/, committed)
Light+dark screenshots: /areas timeline at each zoom (3), popover open, ghost
bars visible, empty state, and the tree|timeline toggle. Use the dev server;
follow the repo's established authed-screenshot path from prior sessions.
