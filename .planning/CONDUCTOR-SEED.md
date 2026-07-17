# Conductor seed — u1-timeline-engine (from Kiwi/Fable)

Read `.planning/DESIGN.md` (sealed contract), `.planning/scout-data-report.md`,
`.planning/scout-ui-report.md` first. This seed is directive; validate against the
worktree and deviate only with a recorded reason in your control report.

## Why this unit exists
u3 (timeline UI) and u4 (drag) build directly against this module's API. Your
exports are a contract consumed by two downstream units — API stability matters
more than internal elegance.

## Target API (lib/projects/timeline.ts)
```ts
export type TimelineZoom = "weeks" | "months" | "quarters";

export interface TimelineProjectInput {
  id: string; name: string; icon: string | null; areaId: string;
  startDate: string | null; endDate: string | null;   // ISO YYYY-MM-DD
  createdAt: string | Date; archivedAt: string | Date | null;
  isClass: boolean; semesterTerm: string | null; semesterYear: number | null;
  orderIndex: number;
}

export interface TimelineWindow { startISO: string; endISO: string; pxPerDay: number; }
export interface TimelineColumn { startISO: string; endISO: string; label: string; isCurrent: boolean; }
export interface TimelineBarGeometry {
  leftPx: number; widthPx: number;
  clampedStart: boolean;          // true start predates window (left fade)
  openEnded: boolean;             // no effective end (right fade, runs on)
  corrupt: boolean;               // start > end in the data (render 1-day, console.warn)
}

export function projectEffectiveStartISO(p: TimelineProjectInput): string;
// start_date ?? (isClass ? semesterStartISO(term, year) : null) ?? createdAt date-part

export function computeWindow(projects: TimelineProjectInput[], zoom: TimelineZoom, todayISO: string): TimelineWindow;
// Window spans min(start anchors, today) - padding .. max(effective ends, today) + padding,
// clamped to sane bounds (e.g. max ~3y span) so one ancient createdAt cannot explode the DOM.

export function columnsForWindow(w: TimelineWindow, zoom: TimelineZoom): TimelineColumn[];
// weeks -> day columns w/ week header groups; months -> week columns w/ month groups;
// quarters -> month columns w/ quarter groups. Two-tier headers: expose both tiers.

export function barGeometry(p: TimelineProjectInput, w: TimelineWindow, todayISO: string): TimelineBarGeometry;

export function pxToISODate(px: number, w: TimelineWindow): string;
export function snapISO(iso: string, zoom: TimelineZoom): string;  // day/day/week snapping
export const ZOOM_PX_PER_DAY: Record<TimelineZoom, number>;

export interface TimelineGroup { area: { id; name; emoji; isSentinel }; projects: TimelineProjectInput[]; }
export function groupByArea(areas, projects, opts: { showArchived: boolean; todayISO: string }): TimelineGroup[];
// order: areas by orderIndex,createdAt; sentinel "No Area" LAST; projects by orderIndex,createdAt.
// archived/expired projects excluded unless showArchived, and flagged (reuse isProjectExpired).
```

Also add `semesterStartISO(term, year)` to `lib/projects/archive-status.ts`
mirroring `semesterEndISO` (same conventions; derive sensible term start months
from the existing end months).

## Hard rules
- ISO-string math ONLY (`todayISODate()` idiom). `new Date("YYYY-MM-DD")` is banned
  (UTC off-by-one). date-fns is fine on Date objects you construct safely
  (year, monthIndex, day) or avoid entirely — string arithmetic + a tiny
  day-add helper is acceptable and testable.
- Zero UI, zero page edits, zero schema/migration changes.
- Tests: `apps/web/lib/projects/__tests__/timeline.test.ts` — cover every
  criteria bullet + the DESIGN.md edge-case list that touches the engine
  (undated, open-ended, corrupt, clamping, snapping at each zoom, sentinel
  ordering, class semester anchors, archived/expired classification).
- If you change any exported name/shape from this seed, list it prominently in
  your control report under `API DEVIATIONS` — downstream briefs get updated
  from that section.

## Gates (run verbatim, report results one per line)
- `pnpm --filter web test`
- `npx tsc --noEmit` from `apps/web` (or the repo's typecheck script if one exists)
