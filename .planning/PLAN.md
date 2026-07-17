# PLAN — u3-timeline-core (sesh-1784257742502)

Supersedes any stale sd-era PLAN.md content. Scope: timeline components +
/areas by-date view with zoom, popover, persistence. NO drag (u4 owns it).

## Component tree (per CONDUCTOR-SEED directive)

```
apps/web/components/projects/timeline/
  useTimelineView.ts        areas:view + areas:timeline-zoom (lifeos:view idiom)
  TimelineZoomToggle.tsx    Weeks/Months/Quarters (DayWeekToggle SEGMENTS grammar) + Today
  TimelineHeader.tsx        two sticky tiers: headerGroupsForWindow over markCurrentColumn(columnsForWindow)
  TimelineBar.tsx           one bar: fades, ghost, label overflow, focus ring, u4 drag seams
  TimelineGroup.tsx         area section: label row + project rows (suppressed when scope="area")
  ProjectBarPopover.tsx     link, start/end date form, archive-trap warn, undo toast
  ProjectsTimeline.tsx      composition: scroller + headers + groups + today marker
```

`ProjectsTimeline` props: `{ areas, projects, showArchived, scope: "all" | "area" }`
— designed for u5's `scope="area"` reuse from day one (scope="area" drops the
group header rows, keeps everything else).

## Engine consumption (u1 API DEVIATIONS are binding)
- `markCurrentColumn(columnsForWindow(w, zoom), todayISO)` — minor/grid tier.
- `headerGroupsForWindow(w, zoom)` — major tier; the two tiers do NOT nest, each
  positioned from its own leftPx/widthPx.
- `computeWindow` + both column calls wrapped in `useMemo` (engine is pure but O(n)).
- `barGeometry` → honor `visible:false` (skip render), `clampedStart`/`clampedEnd`/
  `openEnded` (fades), `corrupt` (1-day bar).
- `groupByArea` → `TimelineRowProject.isGhost` drives the ghost render.
- `todayOffsetPx` → marker + Today button; null = today off-window (hide marker).
- Zero date math in components. ISO strings only.

## Slices (one commit each)
1. `feat(timeline): edge-fade + bar-fade utilities in globals.css` (§23 real classes)
2. `feat(timeline): useTimelineView persistence hook` (SSR default, mount read, write-in-setter)
3. `feat(timeline): TimelineZoomToggle segmented control + Today button`
4. `feat(timeline): TimelineHeader two sticky tiers`
5. `feat(timeline): TimelineBar with fades, ghost, label overflow, focus ring`
6. `feat(timeline): TimelineGroup area rows`
7. `feat(timeline): ProjectBarPopover with archive-trap warning + undo toast`
8. `feat(timeline): ProjectsTimeline composition + scroller + today marker`
9. `feat(areas): tree|timeline view toggle + timeline data wiring + realtime alsoInvalidate`
10. `test(timeline): component + persistence + archive-trap coverage`
11. `docs(planning): u3 plan + evidence`

## Design law applied (DESIGN-SYSTEM.md §14/§16/§18/§21/§23)
- Bars `--sd-accent` fill only (§21 single series, no per-project hue); lane track
  `--sd-input`; pill radius; border-only hover; `--sd-selected` + accent label chip
  when the popover is open; ghost = reduced-opacity accent, never grey gradient.
- Today marker 3px `--sd-accent` @70%, no halo/blur/pulse. Grid 1px `--sd-line`.
- Headers `font-mono text-[11px] uppercase tracking-[0.1em]` ink-faint, `tabular-nums`.
- Fades are REAL classes in globals.css, verified in compiled CSS. No inline gradients.
- §14: entrances opacity/y 160ms, `useReducedMotion()`-guarded. Zoom re-layouts
  instantly — never a width tween. No hover scale.
- No new hex literals. Both themes verified.

## Label overflow rule
Notion-style: when the bar is narrower than its label, the label renders OUTSIDE
the bar to the right, clipped by the row, never wrapping. Decided by estimating
label width from character count rather than DOM measurement (no layout thrash,
and it makes the rule unit-testable).

## Archive trap
Any popover date edit whose new effective end < today triggers a confirm step
before commit (the project vanishes from active lists — Issue #55). Every commit
routes through `updateProject` + the `use-undo-toast` idiom (deferred commit:
optimistic local state, server write on auto-close, undo restores local state and
never writes).

## /areas wiring
- View toggle `areas:view` = "tree" | "timeline"; zoom `areas:timeline-zoom`.
- Data: `getProjectsForCurrentUser` (full rows, both dates) under
  `tableKey("projects", userId)`, sorted CLIENT-side by (orderIndex, createdAt).
  That action's semantics are NOT changed (ProjectDetailClient depends on it).
- Realtime: `useTableSubscription("projects", userId, { alsoInvalidate: [tableKey("areas", userId)] })`
  so date mutations don't leave the sidebar tree stale.

## Known deviation (logged, additive)
`SidebarArea` carries no `createdAt`, but the engine's `groupByArea` requires
`TimelineAreaInput.createdAt` for its documented (orderIndex, createdAt) ordering.
`getSidebarTree` already ORDERS BY `areas.createdAt` but does not SELECT it. Fix is
2 additive lines (select the column, add the field to the interface) rather than
faking a value. No existing consumer is affected.

## Gates
- `npx vitest run tests/projects-timeline-*.test.tsx lib/projects/__tests__/timeline.test.ts` (apps/web)
- `npx tsc --noEmit` (apps/web)
- edge-fade + bar-fade utilities grepped out of the COMPILED css (§23)
- Evidence: light+dark at 3 zooms, popover, ghosts, empty state, toggle.
