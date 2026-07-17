/**
 * `drag-plan` — the pure heart of u4's timeline drag.
 *
 * Every decision a drag makes that ISN'T "listen to a pointer" lives here as a
 * pure function, so snap / commit-patch / cancel / threshold / archive-trap /
 * preview / auto-scroll are unit tests, not browser theater (Conductor trap #3).
 *
 * ZERO new date math: dates only ever move through the u1 engine's `addDaysISO`
 * and are snapped upstream via the engine's `pxToSnappedDayDelta`. This module
 * never parses a date string. Pixels-per-day and the min bar width are the
 * engine's numbers too.
 *
 * The commit seam is intentionally narrow: a release produces a
 * `TimelineDatePatch` and nothing else. The parent owns the optimistic override
 * and the deferred-commit undo toast (Conductor trap #1) — this module has no
 * idea a server exists.
 */

import type { TimelineDatePatch } from "@/components/projects/timeline/ProjectBarPopover";
import { addDaysISO, MIN_BAR_WIDTH_PX } from "@/lib/projects/timeline";
import { isProjectExpired, type ProjectExpiryFields } from "@/lib/projects/archive-status";

// ---------------------------------------------------------------------------
// Tunables — one home for every magic number the drag session reaches for.
// ---------------------------------------------------------------------------

/** Pointer travel before a press becomes a drag; below it, release = click. */
export const DRAG_THRESHOLD_PX = 4;
/** Hold time (ms) to arm a drag on a coarse pointer; below it, native pan wins. */
export const LONG_PRESS_MS = 300;
/** How far a finger may drift during the long-press before it is a pan, not a hold. */
export const TOUCH_MOVE_TOL_PX = 8;
/** Distance from a scroller edge (px) at which auto-scroll engages mid-drag. */
export const AUTOSCROLL_EDGE_PX = 40;
/** Peak auto-scroll speed, px per animation frame, at the very edge. */
export const AUTOSCROLL_MAX_VEL_PX = 18;
/** Base pointer hit-zone for an edge resize handle (widened on coarse pointers). */
export const HANDLE_HIT_PX = 8;

// ---------------------------------------------------------------------------
// Drag mode + inputs
// ---------------------------------------------------------------------------

export type DragMode = "move" | "resize-start" | "resize-end";

export interface DragPlanInput {
  mode: DragMode;
  /** Snapped day delta from the engine's `pxToSnappedDayDelta` (already grained). */
  dayDelta: number;
  /** The bar's raw start (null = undated); the untouched edge is preserved verbatim. */
  rawStartISO: string | null;
  /** The bar's effective start anchor (undated → createdAt / semester start). */
  effectiveStartISO: string;
  /** The bar's raw end (null = open-ended); the untouched edge is preserved verbatim. */
  rawEndISO: string | null;
  /**
   * The bar's VISUAL right edge as a date: a real end, else a class's semester
   * end, else the window edge where an open-ended terminus sits. This is the
   * basis a resize snaps against, so preview pixels and committed dates agree.
   */
  barEndISO: string;
}

/**
 * The `TimelineDatePatch` a drag release commits.
 *
 *  - `move`: shift both edges by `dayDelta`. Only ever reaches a bar with a real
 *    stored end (the hook remaps a pinned-terminus body-drag — open-ended or a
 *    semester-bound class — to `resize-start`, since there is no movable end).
 *  - `resize-start`: move the start edge only, clamped so it can't cross the
 *    bar's visual right edge (that would invert it). The end is preserved
 *    verbatim — a null stays null, so a resize never schedules an undated end.
 *  - `resize-end`: move the end edge only, from the bar's visual right edge. An
 *    open-ended terminus sits at the window edge, so dragging it in CONVERTS it
 *    to a real end date (DESIGN interaction directive #2). Clamped so it can't
 *    cross the start.
 */
export function planDrag(input: DragPlanInput): TimelineDatePatch {
  const { mode, dayDelta, rawStartISO, effectiveStartISO, rawEndISO, barEndISO } = input;

  if (mode === "move") {
    return {
      startDate: addDaysISO(effectiveStartISO, dayDelta),
      endDate: rawEndISO == null ? null : addDaysISO(rawEndISO, dayDelta),
    };
  }

  if (mode === "resize-start") {
    let start = addDaysISO(effectiveStartISO, dayDelta);
    // Can't drag the start past the visual right edge; pin it there (engine
    // renders the floor as a MIN_BAR_WIDTH_PX stub) rather than invert the bar.
    if (start > barEndISO) start = barEndISO;
    return { startDate: start, endDate: rawEndISO };
  }

  // resize-end — snap from the visual right edge so an open terminus converts to
  // a real date and a bounded end moves in step with the preview.
  let end = addDaysISO(barEndISO, dayDelta);
  // Can't drag the end before the start.
  if (end < effectiveStartISO) end = effectiveStartISO;
  return { startDate: rawStartISO, endDate: end };
}

// ---------------------------------------------------------------------------
// No-op + archive-trap classification
// ---------------------------------------------------------------------------

/** True when a patch leaves the project's dates exactly as they were. */
export function isNoopPatch(
  patch: TimelineDatePatch,
  project: { startDate: string | null; endDate: string | null },
): boolean {
  return patch.startDate === (project.startDate ?? null) && patch.endDate === (project.endDate ?? null);
}

/**
 * True when applying this patch would NEWLY expire the project — the same rule
 * the popover uses (`isProjectExpired` after vs. before), so a drag-commit trips
 * the exact same archive trap. Only a trap when the edit CREATES the expiry; a
 * project already sitting in the past has nothing left to warn about.
 */
export function patchWouldArchive(
  project: ProjectExpiryFields,
  patch: TimelineDatePatch,
  todayISO: string,
): boolean {
  const inverted =
    patch.startDate !== null && patch.endDate !== null && patch.startDate > patch.endDate;
  if (inverted) return false;
  return (
    isProjectExpired({ ...project, endDate: patch.endDate }, todayISO) &&
    !isProjectExpired(project, todayISO)
  );
}

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

/** True once the pointer has travelled far enough to be a drag, not a click. */
export function crossedThreshold(dxPx: number): boolean {
  return Math.abs(dxPx) >= DRAG_THRESHOLD_PX;
}

// ---------------------------------------------------------------------------
// Live preview geometry
// ---------------------------------------------------------------------------

export interface BarGeometryPx {
  leftPx: number;
  widthPx: number;
}

/**
 * The inline left/width to paint for a drag frame, given the bar's base geometry
 * and the (already snapped) pixel delta. Written straight to the element's style
 * per frame — no CSS transition on left/width (§14), so the bar snaps live to a
 * truthful drop position rather than easing toward it.
 *
 * The min-width clamp mirrors the engine so a resize can't produce a sliver
 * narrower than a real bar; when the start edge hits that floor it pins to the
 * bar's right edge instead of overshooting.
 */
export function previewGeometry(
  base: BarGeometryPx,
  deltaPx: number,
  mode: DragMode,
  minWidthPx: number = MIN_BAR_WIDTH_PX,
): BarGeometryPx {
  if (mode === "move") {
    return { leftPx: base.leftPx + deltaPx, widthPx: base.widthPx };
  }

  if (mode === "resize-start") {
    let leftPx = base.leftPx + deltaPx;
    let widthPx = base.widthPx - deltaPx;
    if (widthPx < minWidthPx) {
      widthPx = minWidthPx;
      leftPx = base.leftPx + base.widthPx - minWidthPx;
    }
    return { leftPx, widthPx };
  }

  // resize-end
  return { leftPx: base.leftPx, widthPx: Math.max(minWidthPx, base.widthPx + deltaPx) };
}

// ---------------------------------------------------------------------------
// Auto-scroll
// ---------------------------------------------------------------------------

/**
 * Signed auto-scroll speed (px/frame) for a pointer near a scroller's edges:
 * negative near the left, positive near the right, 0 in the calm middle. The
 * speed ramps linearly from 0 at `edgePx` in to `maxVel` at the very edge, so
 * the bar accelerates the closer the pointer gets to the wall. Past the edge
 * (pointer dragged fully out) it saturates at `maxVel` rather than overshooting.
 */
export function autoScrollVelocity(
  pointerX: number,
  rectLeft: number,
  rectRight: number,
  edgePx: number = AUTOSCROLL_EDGE_PX,
  maxVel: number = AUTOSCROLL_MAX_VEL_PX,
): number {
  const distFromLeft = pointerX - rectLeft;
  const distFromRight = rectRight - pointerX;

  if (distFromLeft < edgePx) {
    const ramp = Math.min(1, Math.max(0, (edgePx - distFromLeft) / edgePx));
    return -maxVel * ramp;
  }
  if (distFromRight < edgePx) {
    const ramp = Math.min(1, Math.max(0, (edgePx - distFromRight) / edgePx));
    return maxVel * ramp;
  }
  return 0;
}
