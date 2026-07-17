# u5-area-detail-timeline — plan (sesh-1784257742502)

Bring u3's `ProjectsTimeline` to `/areas/[areaId]` behind a grid|timeline toggle in
the `AreaProjectList` filter row. Consume u3's API NOTES verbatim; ZERO edits under
`components/projects/timeline/**` (u4 owns it concurrently). No new mutation, no
migration, no new props on the frozen components — pre-filter to the single area.

## Slices (each its own commit)

1. **Data widening** — `feat(areas): widen area-detail RSC select + AreaProject for the timeline`
   - `app/(app)/areas/[areaId]/page.tsx`: add `projects.startDate`, `projects.createdAt`,
     `projects.orderIndex`, `projects.semesterTerm/Year`; add `areas.orderIndex`,
     `areas.createdAt`; pass `area` (full) + `userId` into `AreaProjectList`. Additive
     only — grid/header semantics unchanged.
   - `AreaProject` interface widened compatibly (startDate/createdAt/orderIndex/semester*).

2. **Page-scoped view hook** — `feat(areas): page-scoped area-detail:view persistence hook`
   - `components/areas/useAreaDetailView.ts`: `lifeos:view` idiom EXACTLY — `useState("grid")`,
     mount effect reads/validates `localStorage["area-detail:view"]`, write in setter.
     Values `"grid"|"timeline"`, default `"grid"`. A separate hook from the frozen
     `useTimelineView` (which is `areas:view`/"tree" shaped); zoom is NOT duplicated —
     it shares `areas:timeline-zoom` through the frozen hook for free.

3. **Toggle + timeline wiring** — `feat(areas): grid|timeline toggle + timeline on the area detail page`
   - GRID|TIMELINE segmented control (u3 SEGMENTS grammar, `--sd-*` tokens) in the filter row.
   - Timeline branch: `areas=[area]`, `projects=(liveRows?.filter(areaId) ?? RSC props).map(→TimelineProjectInput)`,
     `scope="area"`, `showArchived = tab === "archived"`.
   - Live data via `useQuery(getProjectsForCurrentUser)` keyed on the shared
     `["projects", userId]` (the only read path carrying `start_date`); widened RSC props
     seed first paint (no loading flash).
   - Realtime: `useTableSubscription("projects", userId, { alsoInvalidate: [tableKey("areas", userId)] })`,
     gated on the timeline being active — mirrors the /areas index wiring so date edits
     refresh both the bars and the sidebar tree.
   - One archived control governs both views: the existing Active/Archived tab.
     `hideClasses` stays grid-only. Empty-area: toggle stays visible so the timeline
     "No active projects" panel + toolbar renders.

4. **Tests** — `test(areas): area-detail timeline view, toggle, scope + archived control`
   - `tests/area-detail-view-persistence.test.ts` (hook), `tests/area-detail-timeline.test.tsx`
     (grid default, toggle → timeline scope="area" no group header, tab governs showArchived,
     empty-area toolbar, class filter grid-only, shared-zoom DOM assertion).

5. **Evidence + report** — `docs(planning)`
   - Production build (`next build && next start`) screenshots both themes: grid+toggle,
     timeline (bars, no group header), popover, empty-area timeline, mobile 390px, tablet
     768px. Shared-zoom proven by DOM assertion (`areas:timeline-zoom` set → Quarters
     carries into the detail timeline).

## Gates
- `npx vitest run tests/area-detail-view-persistence.test.ts tests/area-detail-timeline.test.tsx tests/projects-timeline-render.test.tsx lib/projects/__tests__/timeline.test.ts` (from apps/web)
- `npx tsc --noEmit` (from apps/web)
- `git diff --stat` shows ZERO changes under `components/projects/timeline/`
