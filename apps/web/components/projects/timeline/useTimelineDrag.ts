"use client";

/**
 * `useTimelineDrag` — the imperative pointer session behind bar drag + resize.
 *
 * This is the ONLY stateful, DOM-touching half of u4; every decision it makes
 * is deferred to the pure `drag-plan` module, which the tests exercise directly.
 * The hook's whole job is: capture a pointer, tell a drag from a click, paint a
 * live preview by writing inline left/width straight to the bar (no React
 * re-render, no CSS transition on the dragged properties — §14), auto-scroll at
 * the scroller edges, honour Escape, gate touch behind a long-press, and on
 * release hand a `TimelineDatePatch` to the parent's commit seam. It never
 * writes to a server and never re-derives a date — `planDrag` and the u1 engine
 * own all of that (Conductor traps #1 and #3).
 *
 * Touch policy (Conductor ruling): native horizontal panning always wins. A bar
 * drag on a coarse pointer must be armed by a ~300ms long-press held roughly
 * still; any earlier movement is a pan and we get out of its way. Tap stays the
 * popover path — the full mobile editing surface.
 */

import { type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useRef } from "react";

import {
  autoScrollVelocity,
  crossedThreshold,
  type DragMode,
  isNoopPatch,
  LONG_PRESS_MS,
  planDrag,
  previewGeometry,
  TOUCH_MOVE_TOL_PX,
} from "@/components/projects/timeline/drag-plan";
import type { TimelineDatePatch } from "@/components/projects/timeline/ProjectBarPopover";
import {
  projectEffectiveStartISO,
  pxToSnappedDayDelta,
  type TimelineRowProject,
  type TimelineWindow,
  type TimelineZoom,
} from "@/lib/projects/timeline";

interface UseTimelineDragArgs {
  timelineWindow: TimelineWindow;
  zoom: TimelineZoom;
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** The deferred-commit seam — same path the popover uses. NEVER updateProject. */
  onCommit: (project: TimelineRowProject, patch: TimelineDatePatch) => void;
}

export interface BeginDragArgs {
  event: ReactPointerEvent<HTMLElement>;
  project: TimelineRowProject;
  mode: DragMode;
}

interface DragSession {
  project: TimelineRowProject;
  mode: DragMode;
  pointerId: number;
  pointerType: string;
  barEl: HTMLElement;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  baseLeftPx: number;
  baseWidthPx: number;
  /** The inline style to restore so React reclaims geometry after the drag. */
  baseLeftStyle: string;
  baseWidthStyle: string;
  baseTouchAction: string;
  baseCursor: string;
  effectiveStartISO: string;
  zoomAtStart: TimelineZoom;
  /** Coarse pointer only: the long-press has fired and the drag is armed. */
  armed: boolean;
  /** The threshold has been crossed; we are painting a live preview. */
  dragging: boolean;
  autoScrollAccumPx: number;
  rafId: number | null;
  longPressTimer: ReturnType<typeof setTimeout> | null;
}

export function useTimelineDrag({ timelineWindow, zoom, scrollerRef, onCommit }: UseTimelineDragArgs) {
  // The session outlives any single render; args can change under it (a zoom
  // switch, a refetch), so read them live from a ref rather than closing over
  // stale values.
  const argsRef = useRef({ timelineWindow, zoom, scrollerRef, onCommit });
  argsRef.current = { timelineWindow, zoom, scrollerRef, onCommit };

  const sessionRef = useRef<DragSession | null>(null);

  // Paint the current frame: snapped day-delta → snapped pixel-delta → inline
  // left/width straight onto the bar. Snapped so the drop position is always
  // truthful (the bar jumps by the zoom's grain instead of easing).
  const paint = useCallback((s: DragSession) => {
    const { timelineWindow: w, zoom: z } = argsRef.current;
    const dxPx = s.lastClientX - s.startClientX + s.autoScrollAccumPx;
    const dayDelta = pxToSnappedDayDelta(dxPx, w, z);
    const deltaPx = dayDelta * w.pxPerDay;
    const g = previewGeometry({ leftPx: s.baseLeftPx, widthPx: s.baseWidthPx }, deltaPx, s.mode);
    s.barEl.style.left = `${g.leftPx}px`;
    s.barEl.style.width = `${g.widthPx}px`;
  }, []);

  const teardown = useCallback((s: DragSession) => {
    if (s.rafId !== null) cancelAnimationFrame(s.rafId);
    if (s.longPressTimer !== null) clearTimeout(s.longPressTimer);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKeyDown);
    try {
      s.barEl.releasePointerCapture(s.pointerId);
    } catch {
      // Capture may never have been taken (touch pre-arm) or already released.
    }
    // Restore the bar so React's geometry (and the CSS cursor rule) win again.
    s.barEl.style.touchAction = s.baseTouchAction;
    s.barEl.style.cursor = s.baseCursor;
    s.barEl.removeAttribute("data-drag-armed");
    s.barEl.removeAttribute("data-dragging");
    sessionRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Restore the bar's inline geometry to what React last rendered. */
  const restoreBaseGeometry = useCallback((s: DragSession) => {
    s.barEl.style.left = s.baseLeftStyle;
    s.barEl.style.width = s.baseWidthStyle;
  }, []);

  /** After a real drag, swallow the click that pointerup synthesises, so a drag
   *  never also opens the popover. Exactly one click is suppressed. */
  const suppressNextClick = useCallback((el: HTMLElement) => {
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      el.removeEventListener("click", swallow, true);
    };
    el.addEventListener("click", swallow, true);
    // Safety: if no click arrives (some touch flows), don't leave it armed.
    setTimeout(() => el.removeEventListener("click", swallow, true), 350);
  }, []);

  const cancelDrag = useCallback(
    (s: DragSession) => {
      const wasDragging = s.dragging;
      restoreBaseGeometry(s);
      if (wasDragging) suppressNextClick(s.barEl);
      teardown(s);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  // --- rAF auto-scroll loop: only meaningful once dragging. Keeps the bar under
  // the pointer as the canvas slides beneath it. ---
  const tick = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !s.dragging) return;
    const el = argsRef.current.scrollerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const vel = autoScrollVelocity(s.lastClientX, rect.left, rect.right);
      if (vel !== 0) {
        const before = el.scrollLeft;
        el.scrollLeft += vel;
        const applied = el.scrollLeft - before; // clamped at 0 / scrollWidth
        if (applied !== 0) {
          s.autoScrollAccumPx += applied;
          paint(s);
        }
      }
    }
    s.rafId = requestAnimationFrame(tick);
    // Stable identity (reads live state from refs) so the window listeners
    // added by beginDrag are the exact ones teardown removes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerMove = useCallback(
    (e: globalThis.PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;

      // Coarse pointer, not yet armed: any real movement means the user is
      // panning, not dragging. Back out and let the native scroller have it.
      if (!s.armed) {
        const moved = Math.hypot(e.clientX - s.startClientX, e.clientY - s.startClientY);
        if (moved > TOUCH_MOVE_TOL_PX) teardown(s);
        return;
      }

      s.lastClientX = e.clientX;

      // A zoom switch mid-drag invalidates the pixel base we captured; the
      // safest, contract-blessed move is to cancel (DESIGN edge list).
      if (argsRef.current.zoom !== s.zoomAtStart) {
        cancelDrag(s);
        return;
      }

      if (!s.dragging) {
        const dxPx = e.clientX - s.startClientX;
        if (!crossedThreshold(dxPx)) return;
        s.dragging = true;
        s.barEl.setAttribute("data-dragging", "");
        if (s.mode === "move") s.barEl.style.cursor = "grabbing";
        s.rafId = requestAnimationFrame(tick);
      }
      paint(s);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: globalThis.PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;

      // Never armed, or armed but never crossed the threshold: this was a click.
      // Leave the styles untouched so the button's onClick opens the popover.
      if (!s.dragging) {
        teardown(s);
        return;
      }

      const { timelineWindow: w, zoom: z, onCommit: commit } = argsRef.current;
      const dxPx = s.lastClientX - s.startClientX + s.autoScrollAccumPx;
      const dayDelta = pxToSnappedDayDelta(dxPx, w, z);
      const patch = planDrag({
        mode: s.mode,
        dayDelta,
        rawStartISO: s.project.startDate ?? null,
        effectiveStartISO: s.effectiveStartISO,
        rawEndISO: s.project.endDate ?? null,
        windowEndISO: w.endISO,
      });

      restoreBaseGeometry(s);
      suppressNextClick(s.barEl);
      const noop = isNoopPatch(patch, s.project);
      teardown(s);
      // Commit AFTER teardown so the parent's re-render (optimistic override)
      // paints over a bar the hook has already let go of.
      if (!noop) commit(s.project, patch);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const onPointerCancel = useCallback(
    (e: globalThis.PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      cancelDrag(s);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const onKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancelDrag(s);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  // Bind the handlers once; they read the live session from the ref. Attaching
  // per-session risks a stale closure surviving a teardown/re-begin race.
  useEffect(() => {
    return () => {
      const s = sessionRef.current;
      if (s) teardown(s);
    };
  }, [teardown]);

  const arm = useCallback(
    (s: DragSession) => {
      s.armed = true;
      try {
        s.barEl.setPointerCapture(s.pointerId);
      } catch {
        // Some environments (tests) lack pointer capture; the drag still works.
      }
      // While armed we own the gesture, so stop the browser from panning.
      s.barEl.style.touchAction = "none";
      s.barEl.setAttribute("data-drag-armed", "");
    },
    [],
  );

  const beginDrag = useCallback(
    ({ event, project, mode }: BeginDragArgs) => {
      // Only the primary button / a single touch starts a drag.
      if (event.button !== undefined && event.button !== 0) return;

      const barEl =
        (event.currentTarget.closest("[data-timeline-bar]") as HTMLElement | null) ??
        (event.currentTarget as HTMLElement);

      // Corrupt bars are a 1-day stub over bad data; they do not drag.
      if (barEl.hasAttribute("data-corrupt")) return;

      // A resize handle owns this gesture; don't also start a body-move.
      if (mode !== "move") event.stopPropagation();

      // Tear down any orphaned prior session before starting a new one.
      if (sessionRef.current) teardown(sessionRef.current);

      const baseLeftPx = Number(barEl.dataset.barLeftPx ?? "0");
      const baseWidthPx = Number(barEl.dataset.barWidthPx ?? "0");

      const s: DragSession = {
        project,
        mode,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        barEl,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        baseLeftPx,
        baseWidthPx,
        baseLeftStyle: barEl.style.left,
        baseWidthStyle: barEl.style.width,
        baseTouchAction: barEl.style.touchAction,
        baseCursor: barEl.style.cursor,
        effectiveStartISO: projectEffectiveStartISO(project),
        zoomAtStart: argsRef.current.zoom,
        armed: false,
        dragging: false,
        autoScrollAccumPx: 0,
        rafId: null,
        longPressTimer: null,
      };
      sessionRef.current = s;

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("keydown", onKeyDown);

      if (event.pointerType === "touch") {
        // Native panning wins until a long-press held roughly still arms us.
        s.longPressTimer = setTimeout(() => {
          if (sessionRef.current === s) arm(s);
        }, LONG_PRESS_MS);
      } else {
        // Mouse / pen: armed immediately (still just a click until threshold).
        arm(s);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  return { beginDrag };
}
