# Conductor seed — u4-timeline-drag (from Kiwi/Fable)

Read `.planning/DESIGN.md` (sealed contract incl. the Responsive amendment),
`.planning/u3-core-report.md` (its API NOTES section is BINDING — the drag
seams, commit seam, and test ids are defined there), and
`.planning/u1-engine-report.md` (drag math). Scout reports for background.
Stale sd-era planning docs litter `.planning/` — anything not named here is NOT
yours; overwrite PLAN.md with your own plan.

## The seams you build on (do not re-derive)
- `TimelineBar` is a single forwardRef `<button>` with `data-timeline-bar`,
  `data-project-id`, `data-bar-left-px`, `data-bar-width-px`,
  `data-open-ended`, `data-ghost`. Position is inline style from engine
  geometry. `onOpen` is its only callback today; you ADD drag props.
- Commits go through `ProjectsTimeline.handleCommitDates` /
  `ProjectBarPopover`'s `onCommitDates(patch: TimelineDatePatch)` — the
  deferred-commit undo-toast path. Your drag release calls THE SAME seam.
  Never call updateProject directly.
- Engine: `pxToSnappedDayDelta` (per-zoom snapping: weeks→day, months→day,
  quarters→week per sealed contract), `isoDateToPx`, geometry from
  `TimelineBarGeometry`. ZERO new date math in components.
- Archive-trap: reuse/extract the popover's `wouldArchive` logic (an edit that
  NEWLY expires the project) — a drag-commit that trips it shows the same
  confirm before the toast path fires; cancel = full revert.

## Interaction directive (binding)
1. Pointer events + `setPointerCapture` on the bar; drag threshold ~4px before
   a drag starts (below it, release = click = popover). Escape mid-drag cancels
   and reverts. During drag: update inline left/width DIRECTLY per frame — no
   CSS transitions on dragged properties (transitions off while dragging; §14).
2. Edge handles: ~8px hit zones at bar ends (larger via coarse-pointer query),
   cursor `ew-resize`, resize start or end independently. Dragging the faded
   open-ended terminus converts it to a REAL end date at the snapped position.
   Corrupt bars (`data-corrupt`) do not drag.
3. Ghost bars DO drag (they hold real dates) but keep ghost styling during drag.
4. Auto-scroll: when the pointer nears the scroller's left/right edge
   (~40px) mid-drag, scroll and keep the bar under the pointer (rAF loop;
   cancel on release/Escape).
5. TOUCH POLICY (Conductor ruling, from the Responsive amendment): native
   horizontal panning always wins on coarse pointers. Bar drag on touch
   requires a ~300ms long-press to arm (haptic-free, visual cue via the
   selected/border state); tap = popover, which remains the full mobile editing
   path. Set `touch-action` accordingly ONLY while armed. Do not hijack the
   scroller.
6. Snapped preview: while dragging, the bar snaps live (per-zoom) so the drop
   position is always truthful. Optionally surface the dates in the existing
   label chip idiom — no new tooltip surface.
7. a11y: drag is pointer-only; the popover stays the keyboard path (document
   this in your report). Bars keep their focus ring; no ARIA drag theater.

## Also in scope (small, verifier finding)
- `ProjectsTimeline.tsx` populated-state toolbar row (the `flex items-center
  justify-between gap-3` one) gets the same flex-wrap treatment the empty
  state already has (verifier FINDING 1 — the 580fb01c fix missed this row).

## Gates (base = staging 0fba4668; repo-wide vitest is NOT a gate — 31
pre-existing jarvis/voice failures, Conductor ruling)
- `npx vitest run tests/<your new drag tests> tests/projects-timeline-archive-trap.test.tsx tests/projects-timeline-render.test.tsx tests/projects-timeline-view-persistence.test.ts lib/projects/__tests__/timeline.test.ts` (from apps/web)
- `npx tsc --noEmit` (from apps/web)
- Extract drag logic into a testable module (e.g. `useTimelineDrag.ts` or a
  pure `drag-plan.ts`): snap/threshold/commit-patch/cancel become unit tests,
  not browser theater.

## Evidence (.planning/evidence/, committed, prefix u4-)
Production build (`next build && next start` — dev does not hydrate in these
worktrees). Use Playwright mouse APIs to perform REAL drags. Both themes where
visual: mid-drag bar (snapped preview + cursor), after-drop with undo toast
visible, edge-resize mid-gesture, open-ended terminus converted to real end,
archive-trap confirm triggered by a drag, toolbar wrapping at narrow width
(FINDING 1 closed). Verify in the DB-visible UI that undo actually reverts.
