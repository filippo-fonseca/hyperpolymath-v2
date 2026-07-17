# Conductor seed — u5-area-detail-timeline (from Kiwi/Fable)

Read `.planning/DESIGN.md` (sealed contract incl. the Responsive amendment),
`.planning/u3-core-report.md` (API NOTES section is BINDING — ProjectsTimeline
props, useTimelineView keys, empty states), and `.planning/scout-ui-report.md`
(AreaProjectList seam). Stale sd-era planning docs litter `.planning/` —
anything not named here is NOT yours; overwrite PLAN.md with your own plan.

## The contract you consume (u3, merged into your base)
- `ProjectsTimeline { areas, projects, showArchived, scope, toolbarSlot? }` —
  `scope="area"` suppresses area group headers and NOTHING else. There is NO
  areaId prop: you pre-filter `areas` (the one area) and `projects` (its
  projects) before passing them in. Types come from `@/lib/projects/timeline`
  (`TimelineAreaInput` needs the area's `createdAt`; `TimelineProjectInput`
  needs start/end dates, orderIndex, createdAt, classSemester fields — check
  the type, satisfy it from the RSC data path).
- Popover editing, undo toast, archive-trap all live inside ProjectsTimeline —
  you get them for free; verify they work on this page, don't rebuild them.
- Zoom: use the hook's SHARED `areas:timeline-zoom` key so zoom follows the
  user between /areas and detail. View mode: page-scoped key
  `area-detail:view` ("grid" | "timeline", default grid), lifeos:view idiom
  EXACTLY (SSR default, mount effect read, write in setter). u3's
  useTimelineView is areas-page-shaped; if it doesn't decompose cleanly for a
  scoped view key, write a tiny local hook in your own files rather than
  editing u3's — remember: components/projects/timeline/** is FROZEN for you
  (u4 edits it concurrently; any edit there guarantees a merge conflict).
- Realtime: mirror u3's wiring — the projects subscription on this page gets
  `alsoInvalidate` so date mutations from elsewhere refresh the timeline
  (check what the detail page already subscribes to; extend minimally).

## Directive
1. Toggle sits in the AreaProjectList filter row (scout: the seam at the
   filter/sort controls), grammar-consistent with u3's TREE|TIMELINE toggle
   (DayWeekToggle SEGMENTS style). Grid stays the default and byte-for-byte
   unchanged.
2. Data: the detail page RSC select must include start_date (it already has
   end-date-adjacent fields; widen minimally). Do NOT change any existing
   consumer's semantics; additive only. If the page's AreaProject interface is
   reused elsewhere, extend it compatibly.
3. Show-archived: the page has an existing idiom for archived visibility —
   reconcile: the timeline's `showArchived` prop follows the SAME control the
   grid uses (one control governs both views).
4. Empty states come from ProjectsTimeline; make sure the area-with-no-projects
   case renders its "No active projects" panel with the toolbar (screenshot it).
5. Responsive amendment applies: no page-body overflow, toolbar wraps at narrow
   widths, both themes, reduced motion.

## Gates (base = staging 0fba4668; repo-wide vitest is NOT a gate — 31
pre-existing jarvis/voice failures, Conductor ruling)
- `npx vitest run tests/<your new tests> tests/projects-timeline-render.test.tsx lib/projects/__tests__/timeline.test.ts` (from apps/web)
- `npx tsc --noEmit` (from apps/web)
- `git diff --stat` must show ZERO changes under components/projects/timeline/

## Evidence (.planning/evidence/, committed, prefix u5-)
Production build (`next build && next start` — dev does not hydrate in these
worktrees). Both themes: detail page grid view with the new toggle, timeline
view (bars, no group header), popover open on the detail page, empty-area
timeline, ~768px width shot. Note the shared-zoom behavior (set zoom on
/areas, confirm it carries to detail) with a screenshot pair or DOM assertion.
