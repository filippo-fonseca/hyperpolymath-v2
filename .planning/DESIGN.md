# Projects Timeline — sealed design contract
Session: sesh-1784257742502 · Conductor: Kiwi (Fable) · Base: staging/projects-timeline @ b5576f77

## Sealed decisions (human-gated 2026-07-16)
1. **Interactions: FULL DRAG.** Drag bar to move both dates; drag left/right edges to
   resize start/end; PLUS a click popover (project link, status, quick start/end date
   inputs). Popover doubles as the accessible/keyboard path.
2. **Zoom: Weeks / Months / Quarters** segmented control (mirror
   `components/calendar/DayWeekToggle.tsx` grammar: `SEGMENTS` array, hand-rolled).
   Default Months. Persisted in localStorage.
3. **Placement: /areas index AND /areas/[areaId] detail.** Index shows all areas as
   row groups; detail shows that area only. Both behind a view toggle.
4. From the user's brief (pre-sealed): no end date → bar runs on indefinitely
   (open-ended, right-edge fade). Areas gets a proper sidebar nav pill with a
   dimensional icon. Aesthetic = current sd register, NOT Notion's.

## Scout reports (required reading for every unit)
- `.bgsd/runs/sesh-1784257742502/scouts/scout-data-report.md`
- `.bgsd/runs/sesh-1784257742502/scouts/scout-ui-report.md`

## Data contract
- NO migration. `projects.start_date` / `end_date` exist (nullable drizzle `date`,
  ISO `YYYY-MM-DD` strings). Writes go through existing `updateProject`
  (`app/actions/projects.ts:176`) — no new mutation.
- All date math is ISO-string math via the `lib/projects/archive-status.ts` idiom
  (`todayISODate()`, string comparison). NEVER `new Date("YYYY-MM-DD")` (UTC
  off-by-one).
- **Anchors**: `projectEffectiveEndISO()` exists (classes → semester end). Build the
  missing `projectEffectiveStartISO()`: `start_date` ?? (class → semester start) ??
  `createdAt` (date part). Bars clamp to the rendered window with a left fade when
  the anchor predates it.
- **Open-ended**: effective end null → bar extends to the right edge of the rendered
  window, faded terminus (∞ affordance). Both-null → starts at createdAt, open-ended.
- **THE ARCHIVE TRAP**: `end_date` in the past ⇒ project counts as archived
  everywhere (`isProjectExpired`, Issue #55). Timeline shows expired/archived
  projects as muted ghost bars behind the existing show-archived toggle idiom.
  ANY edit (drag or popover) that would set `end_date` < today MUST warn/confirm
  before committing, and every date write gets an undo toast
  (`components/shared/use-undo-toast` idiom).

## Visual contract (sd register — DESIGN-SYSTEM.md is law)
- Bars: `--sd-accent` fill only (§21: cyan is the primary series; no per-project
  hues). Identity lives in the row label. Track/lane: `--sd-input`. Muted/archived:
  reduced-opacity accent, never grey gradients.
- Grid: 1px `--sd-line`. Today marker: 3px `--sd-accent` @70%, no halo/blur/pulse.
- Date headers: sticky, `font-mono text-[11px] uppercase tracking-[0.1em]`
  `--sd-ink-faint`; `tabular-nums` on numerals.
- Area group rows: area emoji + name in `--sd-ink`, meta counts in mono ink-faint.
- Scroller: `.scrollbar-hidden`, edge fades via a real class in globals.css (§23 —
  no inline gradient overlays; no dropped-utility one-offs).
- Motion (§14): entrances opacity/y 160ms; drag ghost via transform ONLY; zoom
  transitions `scaleX`/`translateX`, NEVER animated `width`; `useReducedMotion()`
  guarded; no hover scale, border-only hover.
- Both themes verified before done (§18). Banned list (§16) applies in full.
- Radii: bars pill or 6px; panel frame `.sd-panel` (12px).

## Interaction contract
- Drag: pointer-events based (pointer capture), snapping = 1 day (Weeks), 1 day
  (Months), 1 week (Quarters). Ghost bar follows transform; commit on release →
  optimistic update → `updateProject` → undo toast. Escape cancels drag. Touch OK.
- Resize handles at bar ends (min bar width preserved; open-ended bars: dragging the
  faded terminus sets a real end date).
- Click (no drag threshold crossed) opens the popover.
- Scroll: horizontal wheel/trackpad + drag-scroll on empty canvas; "Today" button
  scrolls/centers today (CalendarGrid ResizeObserver idiom, scrollLeft).
- View toggle + zoom persisted per the `lifeos:view` localStorage idiom
  (`areas:view` = "tree" | "timeline"; `areas:timeline-zoom` = "weeks" | "months"
  | "quarters"). SSR renders defaults; reconcile in mount effect; write in setter.

## Data plumbing
- /areas index: needs full project rows (both dates). Use `getProjectsForCurrentUser`
  (returns full rows) + add explicit sort (orderIndex, createdAt) and archived
  handling CLIENT-side — do NOT change that action's semantics
  (ProjectDetailClient depends on it). Areas list comes from the existing tree data.
- /areas/[areaId]: widen the RSC select to include `start_date` (+ pass-through in
  `AreaProject` interface).
- Realtime: subscribe "projects" with `alsoInvalidate: [tableKey("areas", userId)]`
  where the timeline mutates dates, so the sidebar tree doesn't go stale.

## Edge cases (verify list — every unit's tester checks its slice)
zero projects / zero areas; all projects undated; start after end (data corruption →
render as 1-day bar, log console.warn); very long ranges (clamp + fades); bar
narrower than label (label overflows outside bar, Notion-style); today outside
window; drag past window edge (auto-scroll); reduced motion; dark + light themes;
archived/expired ghosts; sentinel "No Area" group renders last; class projects
(semester anchors); overlapping popover + drag (drag threshold); rapid zoom
switching mid-drag (cancel drag); mobile/touch width; keyboard focus ring on bars
(§ focus-visible ring).

## Non-goals (this session)
No virtualization (tens of projects assumed); no per-project colors; no
milestones/dependencies; no new tables/columns; no desktop/mobile app work;
no URL state (nuqs) for view mode.
