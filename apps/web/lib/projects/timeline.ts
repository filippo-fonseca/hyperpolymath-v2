/**
 * Pure date + geometry engine for the projects timeline (/areas).
 *
 * Every function here is pure and UI-free: no React, no DOM, no I/O. The
 * timeline UI and its drag layer are built entirely on top of these exports.
 *
 * THE DATE RULE: all math is ISO-string math (`YYYY-MM-DD`). `new Date(str)`
 * on a bare date string parses as UTC midnight and then reads back in local
 * time, which silently shifts the day by one west of Greenwich. So dates only
 * ever become numbers through `isoToEpochDay`, which pulls the parts out of the
 * string itself and hands them to `Date.UTC`. The only `new Date(...)` calls in
 * this file take a number of milliseconds, never a string.
 *
 * Weeks start Monday, matching the calendar surfaces (`weekStartsOn: 1`).
 */

import {
  isProjectExpired,
  projectEffectiveEndISO,
  type SemesterTerm,
  semesterStartISO,
} from "@/lib/projects/archive-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimelineZoom = "weeks" | "months" | "quarters";

/** The project fields the timeline needs. A superset of `ProjectExpiryFields`. */
export interface TimelineProjectInput {
  id: string;
  name: string;
  icon: string | null;
  areaId: string;
  /** ISO YYYY-MM-DD, or null when undated. */
  startDate: string | null;
  /** ISO YYYY-MM-DD, or null when open-ended. */
  endDate: string | null;
  createdAt: string | Date;
  archivedAt: string | Date | null;
  isClass: boolean;
  semesterTerm: SemesterTerm | null;
  semesterYear: number | null;
  orderIndex: number;
}

export interface TimelineAreaInput {
  id: string;
  name: string;
  emoji: string | null;
  orderIndex: number;
  createdAt: string | Date;
}

export interface TimelineWindow {
  /** First day rendered, inclusive. */
  startISO: string;
  /** Last day rendered, inclusive. */
  endISO: string;
  pxPerDay: number;
  /** Width of the whole scrollable canvas. */
  totalWidthPx: number;
}

export interface TimelineColumn {
  /** First day of the column, inclusive. */
  startISO: string;
  /** Last day of the column, inclusive. */
  endISO: string;
  label: string;
  /** True when the column contains today. */
  isCurrent: boolean;
  leftPx: number;
  widthPx: number;
}

export interface TimelineBarGeometry {
  leftPx: number;
  widthPx: number;
  /** True when the real start predates the window (left fade). */
  clampedStart: boolean;
  /** True when the real end outruns the window (right fade). */
  clampedEnd: boolean;
  /** True when nothing bounds the end (right fade, runs on). */
  openEnded: boolean;
  /** True when start > end in the data. Rendered as a 1-day bar. */
  corrupt: boolean;
  /** False when the project falls entirely outside a clamped window. */
  visible: boolean;
}

export interface TimelineRowProject extends TimelineProjectInput {
  /** Archived outright or past its effective end: render as a muted ghost. */
  isGhost: boolean;
}

export interface TimelineGroup {
  area: { id: string; name: string; emoji: string | null; isSentinel: boolean };
  projects: TimelineRowProject[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ZOOM_PX_PER_DAY: Record<TimelineZoom, number> = {
  weeks: 28,
  months: 8,
  quarters: 3,
};

/** Breathing room on each side of the data, in days, per zoom. */
export const ZOOM_PADDING_DAYS: Record<TimelineZoom, number> = {
  weeks: 3,
  months: 14,
  quarters: 45,
};

/**
 * Hard ceiling on the rendered span, so a single ancient `createdAt` cannot
 * blow the window out to a decade of columns and explode the DOM.
 */
export const MAX_WINDOW_DAYS = 1096; // ~3 years

/** A bar never renders thinner than this, however short its span. */
export const MIN_BAR_WIDTH_PX = 8;

const MS_PER_DAY = 86_400_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// ---------------------------------------------------------------------------
// ISO date arithmetic
// ---------------------------------------------------------------------------

/** Days since the epoch. Reads the parts off the string; never parses it. */
export function isoToEpochDay(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Inverse of `isoToEpochDay`. `new Date(number)` is timezone-safe. */
export function epochDayToISO(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  return epochDayToISO(isoToEpochDay(iso) + days);
}

/** Signed day count from `fromISO` to `toISO`. */
export function diffDaysISO(fromISO: string, toISO: string): number {
  return isoToEpochDay(toISO) - isoToEpochDay(fromISO);
}

export function minISO(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxISO(a: string, b: string): string {
  return a >= b ? a : b;
}

export function clampISO(iso: string, lowISO: string, highISO: string): string {
  return minISO(maxISO(iso, lowISO), highISO);
}

/** Monday = 0 … Sunday = 6. Epoch day 0 (1970-01-01) was a Thursday. */
export function weekdayIndexISO(iso: string): number {
  return (((isoToEpochDay(iso) + 3) % 7) + 7) % 7;
}

export function startOfWeekISO(iso: string): string {
  return addDaysISO(iso, -weekdayIndexISO(iso));
}

export function endOfWeekISO(iso: string): string {
  return addDaysISO(startOfWeekISO(iso), 6);
}

export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonthsISO(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = (((total % 12) + 12) % 12) + 1;
  const cappedDay = Math.min(day, daysInMonth(newYear, newMonth));
  return `${pad4(newYear)}-${pad2(newMonth)}-${pad2(cappedDay)}`;
}

export function endOfMonthISO(iso: string): string {
  return addDaysISO(addMonthsISO(startOfMonthISO(iso), 1), -1);
}

export function startOfQuarterISO(iso: string): string {
  const month = Number(iso.slice(5, 7));
  const quarterFirstMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${iso.slice(0, 4)}-${pad2(quarterFirstMonth)}-01`;
}

export function endOfQuarterISO(iso: string): string {
  return addDaysISO(addMonthsISO(startOfQuarterISO(iso), 3), -1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * The UTC date part of a timestamp column. Bare `YYYY-MM-DD` strings are
 * sliced (never parsed); full timestamps carry an offset and so are safe to
 * hand to `Date`.
 */
export function toDateISO(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (ISO_DATE_RE.test(value)) return value;
  return new Date(value).toISOString().slice(0, 10);
}

function toSortableTime(value: string | Date): number {
  if (value instanceof Date) return value.getTime();
  if (ISO_DATE_RE.test(value)) return isoToEpochDay(value) * MS_PER_DAY;
  return new Date(value).getTime();
}

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

/**
 * The day a project effectively begins. Mirrors `projectEffectiveEndISO`:
 * an explicit start date wins, a class otherwise starts with its semester,
 * and anything left over starts the day it was created. Unlike the end anchor
 * this never returns null — everything exists from some day onward.
 */
export function projectEffectiveStartISO(p: TimelineProjectInput): string {
  if (p.startDate) return p.startDate;
  if (p.isClass && p.semesterTerm && p.semesterYear != null) {
    return semesterStartISO(p.semesterTerm, p.semesterYear);
  }
  return toDateISO(p.createdAt);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

/**
 * The span the timeline renders: every project's anchors plus today, padded,
 * capped at `MAX_WINDOW_DAYS`, then snapped out to whole columns so the grid
 * tiles exactly. Today is always inside the result.
 */
export function computeWindow(
  projects: TimelineProjectInput[],
  zoom: TimelineZoom,
  todayISO: string,
): TimelineWindow {
  let startISO = todayISO;
  let endISO = todayISO;

  for (const p of projects) {
    const projectStart = projectEffectiveStartISO(p);
    startISO = minISO(startISO, projectStart);
    // A corrupt end (before its own start) must not drag the window backwards
    // past the bar we are going to draw at the start anchor.
    const projectEnd = projectEffectiveEndISO(p);
    endISO = maxISO(endISO, maxISO(projectStart, projectEnd ?? projectStart));
  }

  const padding = ZOOM_PADDING_DAYS[zoom];
  startISO = addDaysISO(startISO, -padding);
  endISO = addDaysISO(endISO, padding);

  ({ startISO, endISO } = clampWindowSpan(startISO, endISO, todayISO));
  ({ startISO, endISO } = snapWindowToColumns(startISO, endISO, zoom));

  const pxPerDay = ZOOM_PX_PER_DAY[zoom];
  return {
    startISO,
    endISO,
    pxPerDay,
    totalWidthPx: (diffDaysISO(startISO, endISO) + 1) * pxPerDay,
  };
}

/**
 * Trim an over-long span down to `MAX_WINDOW_DAYS`, centred on today and then
 * pushed back inside the real bounds so we never render empty space that no
 * project reaches. Callers guarantee `rawStart <= today <= rawEnd`, which is
 * what keeps today inside the trimmed window.
 */
function clampWindowSpan(
  rawStartISO: string,
  rawEndISO: string,
  todayISO: string,
): { startISO: string; endISO: string } {
  if (diffDaysISO(rawStartISO, rawEndISO) + 1 <= MAX_WINDOW_DAYS) {
    return { startISO: rawStartISO, endISO: rawEndISO };
  }

  let startISO = addDaysISO(todayISO, -Math.floor(MAX_WINDOW_DAYS / 2));
  let endISO = addDaysISO(startISO, MAX_WINDOW_DAYS - 1);

  if (startISO < rawStartISO) {
    startISO = rawStartISO;
    endISO = addDaysISO(startISO, MAX_WINDOW_DAYS - 1);
  }
  if (endISO > rawEndISO) {
    endISO = rawEndISO;
    startISO = maxISO(rawStartISO, addDaysISO(endISO, -(MAX_WINDOW_DAYS - 1)));
  }
  return { startISO, endISO };
}

/** Grow the window out to whole minor columns so the grid tiles exactly. */
function snapWindowToColumns(
  startISO: string,
  endISO: string,
  zoom: TimelineZoom,
): { startISO: string; endISO: string } {
  if (zoom === "quarters") {
    return { startISO: startOfMonthISO(startISO), endISO: endOfMonthISO(endISO) };
  }
  return { startISO: startOfWeekISO(startISO), endISO: endOfWeekISO(endISO) };
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/**
 * The minor header tier, which is also the grid: one column per day (weeks),
 * per week (months), or per month (quarters). Pair with `headerGroupsForWindow`
 * for the major tier above it.
 */
export function columnsForWindow(w: TimelineWindow, zoom: TimelineZoom): TimelineColumn[] {
  switch (zoom) {
    case "weeks":
      return buildColumns(w, startOfDayNoop, (iso) => iso, (iso) => String(Number(iso.slice(8, 10))));
    case "months":
      return buildColumns(w, startOfWeekISO, endOfWeekISO, weekLabel);
    case "quarters":
      return buildColumns(w, startOfMonthISO, endOfMonthISO, (iso) => MONTH_ABBR[Number(iso.slice(5, 7)) - 1]);
  }
}

/**
 * The major header tier: week groups (weeks), month groups (months), or
 * quarter groups (quarters). Groups do not nest inside the minor columns —
 * month groups cut across week columns — so each is positioned from its own
 * dates and clipped to the window.
 */
export function headerGroupsForWindow(w: TimelineWindow, zoom: TimelineZoom): TimelineColumn[] {
  switch (zoom) {
    case "weeks":
      return buildColumns(w, startOfWeekISO, endOfWeekISO, weekLabel);
    case "months":
      return buildColumns(w, startOfMonthISO, endOfMonthISO, monthLabel);
    case "quarters":
      return buildColumns(w, startOfQuarterISO, endOfQuarterISO, quarterLabel);
  }
}

function startOfDayNoop(iso: string): string {
  return iso;
}

function weekLabel(weekStartISO: string): string {
  return `${MONTH_ABBR[Number(weekStartISO.slice(5, 7)) - 1]} ${Number(weekStartISO.slice(8, 10))}`;
}

function monthLabel(iso: string): string {
  return `${MONTH_ABBR[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

function quarterLabel(iso: string): string {
  return `Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1} ${iso.slice(0, 4)}`;
}

/**
 * Walk the window in unit-sized steps, emitting one column per unit clipped to
 * the window. `labelOf` receives the unit's true (unclipped) start, so an edge
 * group still reads "Jul 2026" even when only its last three days are visible.
 */
function buildColumns(
  w: TimelineWindow,
  startOfUnit: (iso: string) => string,
  endOfUnit: (iso: string) => string,
  labelOf: (unitStartISO: string) => string,
): TimelineColumn[] {
  const columns: TimelineColumn[] = [];
  let cursorISO = startOfUnit(w.startISO);
  while (cursorISO <= w.endISO) {
    const unitEndISO = endOfUnit(cursorISO);
    const startISO = maxISO(cursorISO, w.startISO);
    const endISO = minISO(unitEndISO, w.endISO);
    const leftPx = diffDaysISO(w.startISO, startISO) * w.pxPerDay;
    columns.push({
      startISO,
      endISO,
      label: labelOf(cursorISO),
      isCurrent: false,
      leftPx,
      widthPx: (diffDaysISO(startISO, endISO) + 1) * w.pxPerDay,
    });
    cursorISO = addDaysISO(unitEndISO, 1);
  }
  return columns;
}

/**
 * Stamp `isCurrent` on whichever column contains today. Kept separate from
 * `columnsForWindow` so column geometry stays independent of the clock; the UI
 * composes the two.
 */
export function markCurrentColumn(columns: TimelineColumn[], todayISO: string): TimelineColumn[] {
  return columns.map((c) => ({
    ...c,
    isCurrent: c.startISO <= todayISO && todayISO <= c.endISO,
  }));
}

/** Where today's marker sits on the canvas, or null when today is off-window. */
export function todayOffsetPx(w: TimelineWindow, todayISO: string): number | null {
  if (todayISO < w.startISO || todayISO > w.endISO) return null;
  return diffDaysISO(w.startISO, todayISO) * w.pxPerDay;
}

// ---------------------------------------------------------------------------
// Bar geometry
// ---------------------------------------------------------------------------

/** Corrupt rows warn once each, not once per drag frame. */
const warnedCorrupt = new Set<string>();

/**
 * Where a project's bar sits on the canvas.
 *
 * Four shapes come out of this, driven by the data rather than by flags the
 * caller passes: a normal bounded bar; an open-ended bar that runs to the right
 * edge because nothing bounds its end; a bar clipped at one or both edges
 * because the window was capped; and a 1-day stub for a row whose start is
 * after its own end, which is corrupt data we render rather than crash on.
 *
 * `_todayISO` is unused: an open-ended bar runs to the window's edge, not to
 * today. It stays in the signature because u3/u4 are built against it, and
 * because a future "runs to today" variant would want it back.
 */
export function barGeometry(
  p: TimelineProjectInput,
  w: TimelineWindow,
  _todayISO: string,
): TimelineBarGeometry {
  const startISO = projectEffectiveStartISO(p);
  const rawEndISO = projectEffectiveEndISO(p);
  const openEnded = rawEndISO == null;
  const corrupt = rawEndISO != null && startISO > rawEndISO;

  if (corrupt && !warnedCorrupt.has(p.id)) {
    warnedCorrupt.add(p.id);
    console.warn(
      `[timeline] project ${p.id} ("${p.name}") starts ${startISO} after it ends ${rawEndISO}; rendering a 1-day bar.`,
    );
  }

  // Corrupt rows collapse to a single day at the start anchor. Open-ended rows
  // run to the window's edge; the fade, not the geometry, says "and onward".
  const endISO = corrupt ? startISO : (rawEndISO ?? w.endISO);

  const visible = startISO <= w.endISO && endISO >= w.startISO;
  const clampedStart = startISO < w.startISO;
  const clampedEnd = !openEnded && endISO > w.endISO;

  if (!visible) {
    return { leftPx: 0, widthPx: 0, clampedStart, clampedEnd, openEnded, corrupt, visible: false };
  }

  const visibleStartISO = maxISO(startISO, w.startISO);
  const visibleEndISO = minISO(endISO, w.endISO);
  const spanDays = diffDaysISO(visibleStartISO, visibleEndISO) + 1;

  return {
    leftPx: diffDaysISO(w.startISO, visibleStartISO) * w.pxPerDay,
    widthPx: Math.max(MIN_BAR_WIDTH_PX, spanDays * w.pxPerDay),
    clampedStart,
    clampedEnd,
    openEnded,
    corrupt,
    visible: true,
  };
}

// ---------------------------------------------------------------------------
// Drag math
// ---------------------------------------------------------------------------

/**
 * The date under a canvas x-offset. Deliberately unclamped: a drag that runs
 * past the window edge auto-scrolls rather than sticking, so the caller wants
 * the true date, not a pinned one.
 */
export function pxToISODate(px: number, w: TimelineWindow): string {
  return addDaysISO(w.startISO, Math.floor(px / w.pxPerDay));
}

/** Inverse of `pxToISODate`: the left edge of a date's cell. */
export function isoDateToPx(iso: string, w: TimelineWindow): number {
  return diffDaysISO(w.startISO, iso) * w.pxPerDay;
}

/**
 * Round a dragged date to the zoom's grain: whole days at weeks and months,
 * whole weeks at quarters, where a day is only three pixels wide and per-day
 * precision would be a lie.
 */
export function snapISO(iso: string, zoom: TimelineZoom): string {
  return zoom === "quarters" ? startOfWeekISO(iso) : iso;
}

/** Days a drag of `px` moves a bar, at the zoom's snapping grain. */
export function pxToSnappedDayDelta(px: number, w: TimelineWindow, zoom: TimelineZoom): number {
  const days = Math.round(px / w.pxPerDay);
  return zoom === "quarters" ? Math.round(days / 7) * 7 : days;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** The per-user catch-all area, identified structurally (see AreasPageClient). */
export function isSentinelArea(a: { name: string; emoji: string | null }): boolean {
  return a.name === "No Area" && a.emoji === null;
}

/** Archived outright, or past its effective end (Issue #55). */
export function isProjectGhost(p: TimelineProjectInput, todayISO: string): boolean {
  return p.archivedAt != null || isProjectExpired(p, todayISO);
}

function byOrderThenCreated(
  a: { orderIndex: number; createdAt: string | Date },
  b: { orderIndex: number; createdAt: string | Date },
): number {
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return toSortableTime(a.createdAt) - toSortableTime(b.createdAt);
}

/**
 * Projects bucketed into area rows, in render order: areas by orderIndex then
 * createdAt with the "No Area" sentinel pinned last, projects the same way
 * inside each. Ghosts (archived or expired) are dropped unless `showArchived`,
 * in which case they come through flagged for muted rendering.
 *
 * Areas with no projects are kept; whether an empty lane renders is the UI's
 * call, not the engine's.
 */
export function groupByArea(
  areas: TimelineAreaInput[],
  projects: TimelineProjectInput[],
  opts: { showArchived: boolean; todayISO: string },
): TimelineGroup[] {
  const byArea = new Map<string, TimelineRowProject[]>();
  for (const a of areas) byArea.set(a.id, []);

  for (const p of projects) {
    const bucket = byArea.get(p.areaId);
    if (!bucket) continue; // project in an area the caller didn't pass (archived area)
    const isGhost = isProjectGhost(p, opts.todayISO);
    if (isGhost && !opts.showArchived) continue;
    bucket.push({ ...p, isGhost });
  }

  const sentinels: TimelineAreaInput[] = [];
  const regular: TimelineAreaInput[] = [];
  for (const a of areas) (isSentinelArea(a) ? sentinels : regular).push(a);

  regular.sort(byOrderThenCreated);
  sentinels.sort(byOrderThenCreated);

  return [...regular, ...sentinels].map((a) => ({
    area: { id: a.id, name: a.name, emoji: a.emoji, isSentinel: isSentinelArea(a) },
    projects: (byArea.get(a.id) ?? []).sort(byOrderThenCreated),
  }));
}
