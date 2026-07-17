# PLAN — u4-timeline-drag (sesh-1784257742502)

Supersedes any stale sd-era / u3 PLAN.md content. Scope: full drag interactions
on timeline bars. NO new date math (engine only); NO new mutation (u3's
`onCommitDates`/`handleCommitDates` deferred-commit undo seam only). Touched
paths: `apps/web/components/projects/timeline/**` + scoped test files only.

Slices (each its own focused commit, explicit pathspecs, branch
`bgsd/sesh-1784257742502/u4-timeline-drag`):

1. **fix(timeline): wrap populated-state toolbar row** — verifier FINDING 1.
   `flex items-center justify-between gap-3` → `flex flex-wrap items-center
   justify-between gap-x-3 gap-y-2` (same treatment the empty state already has).

2. **feat(timeline): pure drag-plan module** (`drag-plan.ts`) — every non-pointer
   decision as pure, unit-testable functions over the u1 engine only: `planDrag`
   (move / resize-start / resize-end, open-ended terminus → real end, null-edge
   preservation, clamps), `previewGeometry`, `autoScrollVelocity`, `isNoopPatch`,
   `patchWouldArchive` (same `isProjectExpired` rule as the popover),
   `crossedThreshold`, plus the tunables (threshold, long-press, edge, hit-zone).

3. **test(timeline): drag-plan unit tests** — snap/commit-patch (all 3 modes),
   threshold, cancel (no-op), archive-trap detection, preview geometry, auto-scroll.

4. **feat(timeline): useTimelineDrag hook** — imperative pointer session:
   `setPointerCapture`, 4px threshold (below = click = popover), rAF preview via
   direct inline left/width writes (no CSS transition on dragged props),
   auto-scroll rAF loop keeping the bar under the pointer, Escape cancels + full
   revert, touch long-press (~300ms) to arm else native pan wins, release builds
   the patch and calls the parent commit seam, suppresses the post-drag click.

5. **feat(timeline): drag seams on TimelineBar** — `onBeginDrag` prop; two 8px
   edge resize-handles (wider on coarse pointer), `cursor-ew-resize`; corrupt bars
   don't drag; ghost bars drag but keep ghost styling; click still opens popover.

6. **feat(timeline): thread drag through TimelineGroup** — pass the drag starter
   from `ProjectsTimeline` down to each `TimelineBar`.

7. **feat(timeline): ProjectsTimeline drag controller + archive-trap confirm** —
   instantiate `useTimelineDrag`; route release through `handleDragCommit` →
   reuses `handleCommitDates`/`onCommitDates` (NEVER `updateProject` directly); a
   drag that newly expires a project opens an AlertDialog confirm before the toast
   path fires — cancel = full revert.

   (+ follow-up fix: keep drag preview and committed dates consistent for
   pinned-terminus bars — `barEndISO` = real end ?? semester end ?? window edge.)

8. **docs(planning): u4 evidence** — production build + Playwright real mouse
   drags; both themes; mid-drag snapped preview, after-drop undo toast, edge
   resize, open-ended terminus→real end, archive-trap-by-drag, toolbar wrap at
   narrow width; mobile(390)/tablet(768). Verify undo actually reverts in the UI.

Gates (from apps/web): the scoped vitest set in the seed + the new drag test, and
`npx tsc --noEmit`. Repo-wide vitest is NOT a gate (31 pre-existing failures).

a11y note: drag is pointer-only by design; the popover remains the full keyboard
+ mobile editing path. Bars keep their focus ring; no ARIA drag theater.
