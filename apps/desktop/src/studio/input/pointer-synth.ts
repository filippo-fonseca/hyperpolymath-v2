/**
 * Hand → DOM pointer synthesis (desktop consumer).
 *
 * The web source drives a 3D scene from the hub's grab/drag phases via a raycast
 * hover provider. The desktop Studio is plain DOM: widget windows, the drawer,
 * and its tiles/chips already implement real pointer-drag + click handlers. So
 * this consumer keeps the SAME driver→hub contract and, instead of a 3D scene,
 * synthesizes DOM PointerEvents at the reticle:
 *
 *   - a hover provider hit-tests the real widget DOM under the reticle (so the
 *     hub's grab/expand upgrades never drop, and the reticle snaps on hittables);
 *   - `grabStart/grabMove/grabEnd` become a pointerdown→move→up drag on the
 *     grabbed widget's header (or the orb root, or a drawer tile) — moving the
 *     widget or drag-placing a tile through the window's OWN handlers. A grab
 *     that begins over a widget's corner resize zone instead drives its resize
 *     handle (pinch-corner-resize), reusing the same pinch machine to resize;
 *   - a `tap`/`expand` intent (quick-pinch / palm-click) becomes a synthesized
 *     click at the reticle — summoning a drawer tile, restoring a stowed chip,
 *     or pressing a button (routed into a promoted child webview over IPC).
 *
 * We never edit the widget store or WidgetWindow: the windows are a read-only DOM
 * we hit-test against and dispatch into. Coordinates come from the frozen cursor
 * (index fingertip) for presses and grab-start, and from the pinch-drag palm
 * centroid (`grabMove.nx/ny`) for the drag itself, since gesture-core freezes the
 * cursor while pinched.
 */

import { useEffect, useMemo, useRef } from "react";

import {
  useStudioHoverProvider,
  useStudioIntent,
  useStudioInput,
  useStudioPhase,
} from "./react";
import type { HoverProvider, StudioCursor } from "./types";
import { STUDIO_COLORS } from "../tokens";
import {
  getWidgetWindows,
  resizeWidget,
} from "../state/widget-windows";
import { clickNativeWebview, scrollNativeWebview } from "../windows/native-webview";
import { confirmPendingSend, cancelPendingSend } from "@/actions/confirm-gate";
import {
  dispatchGestureInteraction,
  hitTest,
  nativeWebviewLabelAt,
  nativeWebviewLocalPoint,
} from "./pointer-synth-core";

// Re-export the seam contract so listeners import it from the consumer module.
export {
  GESTURE_INTERACTION_EVENT,
  type GestureInteractionDetail,
} from "./pointer-synth-core";

/** A synthetic pointer id, far from any real (1+) pointer, so shims can target it. */
const SYNTH_POINTER_ID = 90210;

// WidgetWindow/Drawer call `setPointerCapture(pointerId)` inside their pointerdown
// handlers. The Pointer Events spec throws for a pointerId with no active (real)
// pointer, which our synthetic id has. A failed capture is harmless here — every
// subsequent move/up is dispatched to the same element by us regardless — so
// swallow it, but ONLY for our id; real pointers keep native behavior. Installed
// once, lazily, so importing this module never patches prototypes at load on SSR.
let shimInstalled = false;
function installPointerCaptureShim(): void {
  if (shimInstalled || typeof Element === "undefined") return;
  shimInstalled = true;
  const origSet = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function setPointerCapture(id: number): void {
    if (id === SYNTH_POINTER_ID) {
      try {
        origSet.call(this, id);
      } catch {
        /* synthetic pointer has no active capture target; non-fatal */
      }
      return;
    }
    return origSet.call(this, id);
  };
  const origRelease = Element.prototype.releasePointerCapture;
  Element.prototype.releasePointerCapture = function releasePointerCapture(id: number): void {
    if (id === SYNTH_POINTER_ID) {
      try {
        origRelease.call(this, id);
      } catch {
        /* non-fatal */
      }
      return;
    }
    return origRelease.call(this, id);
  };
}

/**
 * Live stage rect (viewport coords) for stage-normalized ↔ viewport conversion.
 * Prefers `[data-studio-stage]`; falls back to the widget layer (inset:0 of the
 * stage — identical rect in the real app) so bare hosts (the debug harness) still
 * hit-test.
 */
function stageRect(): DOMRect | null {
  const el =
    document.querySelector<HTMLElement>("[data-studio-stage]") ??
    document.querySelector<HTMLElement>("[data-widget-window-layer]");
  return el ? el.getBoundingClientRect() : null;
}

function dispatchPointer(
  type: "pointerdown" | "pointermove" | "pointerup",
  target: Element,
  vx: number,
  vy: number,
  buttons: number,
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: SYNTH_POINTER_ID,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons,
      clientX: vx,
      clientY: vy,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    }),
  );
}

function dispatchClick(target: Element, vx: number, vy: number): void {
  target.dispatchEvent(
    new MouseEvent("click", {
      button: 0,
      clientX: vx,
      clientY: vy,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    }),
  );
}

/** Dispatch a synthetic vertical WheelEvent onto the DOM element at the cursor. */
function dispatchWheel(target: Element, vx: number, vy: number, dy: number): void {
  target.dispatchEvent(
    new WheelEvent("wheel", {
      deltaX: 0,
      deltaY: dy,
      deltaMode: 0, // WheelEvent.DOM_DELTA_PIXEL
      clientX: vx,
      clientY: vy,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    }),
  );
}

/** The live widget-window frame element for an id, or null. */
function widgetElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-widget-window="${CSS.escape(id)}"]`);
}

/**
 * Toggle the "resize armed" affordance on a widget frame: a bright accent ring so
 * the user SEES which widget an open-hand resize is driving. Applied imperatively
 * (no React state) so it never churns the hot path; cleared on `resizeEnd`.
 */
function setResizeAffordance(id: string, armed: boolean): void {
  const el = widgetElement(id);
  if (!el) return;
  if (armed) {
    el.dataset.resizeArmed = "true";
    el.style.outline = `2px solid ${STUDIO_COLORS.accent}`;
    el.style.outlineOffset = "2px";
    el.style.boxShadow = `0 0 0 1px ${STUDIO_COLORS.accent}, 0 20px 56px color-mix(in srgb, ${STUDIO_COLORS.shadow} 78%, transparent)`;
  } else {
    delete el.dataset.resizeArmed;
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.style.boxShadow = "";
  }
}

type GrabState = {
  dragTarget: Element | null;
  /** True until the first grabMove dispatches the pointerdown at the palm origin. */
  pendingDown: boolean;
  lastX: number;
  lastY: number;
  /** The widget this grab drives (for the U3 gesture-interaction seam event). */
  widgetId: string;
  /** "resize" when the grab landed on the corner handle, else "drag" (a move). */
  kind: "resize" | "drag";
};

type ResizeState = {
  id: string;
  /** Widget w/h captured at arm time; the emitted scale multiplies these. */
  w0: number;
  h0: number;
};

type ScrollState = {
  /** Live native child-webview label if this surface is a promoted browser. */
  nativeLabel: string | null;
  /** Element a DOM WheelEvent is dispatched onto (non-native surfaces). */
  domTarget: Element | null;
  lastX: number;
  lastY: number;
};

/**
 * Wires the hand hub into the widget DOM. Must be rendered inside a
 * {@link StudioInputProvider}. Zero re-renders: everything runs through effect
 * subscriptions and imperative event dispatch.
 */
export function useHandPointerSynthesis(): void {
  const bus = useStudioInput();
  const grab = useRef<GrabState | null>(null);
  const resize = useRef<ResizeState | null>(null);
  const scroll = useRef<ScrollState | null>(null);

  useEffect(() => {
    installPointerCaptureShim();
  }, []);

  // Hover provider: gate the hub's grab/expand upgrades and drive the reticle
  // snap by hit-testing the live widget DOM under the reticle.
  const provider: HoverProvider = useMemo(
    () => ({
      id: "desktop-dom-hit",
      priority: 10,
      resolve: (cursor: StudioCursor): string | null => {
        if (!cursor.active) return null;
        const rect = stageRect();
        if (!rect) return null;
        return hitTest(rect.left + cursor.x, rect.top + cursor.y)?.id ?? null;
      },
    }),
    [],
  );
  useStudioHoverProvider(provider);

  // Drawer targeting glow: when the reticle hovers the drawer, ring it in accent
  // so the user SEES they can open/click it with the hand. Driven off the hub's
  // resolved hover (not per-frame) and applied imperatively to avoid re-renders.
  useEffect(() => {
    let glowing = false;
    const setDrawerGlow = (on: boolean): void => {
      if (on === glowing) return;
      glowing = on;
      const el = document.querySelector<HTMLElement>("[data-widget-drawer]");
      if (!el) return;
      if (on) {
        el.dataset.handHover = "true";
        el.style.borderColor = STUDIO_COLORS.accent;
        el.style.boxShadow = `0 -10px 34px color-mix(in srgb, ${STUDIO_COLORS.accent} 30%, transparent)`;
      } else {
        delete el.dataset.handHover;
        el.style.borderColor = "";
        el.style.boxShadow = "";
      }
    };
    const unsub = bus.subscribe(() => {
      setDrawerGlow(bus.getSnapshot().hoverTargetId === "drawer");
    });
    setDrawerGlow(bus.getSnapshot().hoverTargetId === "drawer");
    return () => {
      unsub();
      setDrawerGlow(false);
    };
  }, [bus]);

  const cursorViewport = (): { x: number; y: number } | null => {
    const rect = stageRect();
    if (!rect) return null;
    const c = bus.getSnapshot().cursor;
    return { x: rect.left + c.x, y: rect.top + c.y };
  };

  const normViewport = (nx: number, ny: number): { x: number; y: number } | null => {
    const rect = stageRect();
    if (!rect) return null;
    return { x: rect.left + nx * rect.width, y: rect.top + ny * rect.height };
  };

  // Grab lifecycle → widget/tile pointer-drag. The cursor is frozen while pinched,
  // so grab-start hit-tests the frozen reticle (the aim point) but the drag itself
  // follows the pinch-drag palm centroid, with pointerdown deferred to the first
  // grabMove so the drag origin is the palm — no jump from a fingertip/palm offset.
  useStudioPhase((phase) => {
    switch (phase.type) {
      case "grabStart": {
        const vp = cursorViewport();
        if (!vp) {
          grab.current = null;
          break;
        }
        const hit = hitTest(vp.x, vp.y);
        // Pinch-corner-resize: when the frozen reticle sits in a widget's resize
        // zone, drive the grab onto its resize HANDLE (running the widget's own
        // resize logic) instead of the header — the same trusted pinch machine
        // resizes rather than moves. Otherwise it's a normal move drag.
        const target = hit?.resizeTarget ?? hit?.dragTarget ?? null;
        if (hit && target) {
          const kind: "resize" | "drag" = hit.resizeTarget ? "resize" : "drag";
          grab.current = {
            dragTarget: target,
            pendingDown: true,
            lastX: vp.x,
            lastY: vp.y,
            widgetId: hit.id,
            kind,
          };
        } else {
          grab.current = null;
        }
        break;
      }
      case "grabMove": {
        const g = grab.current;
        if (!g || !g.dragTarget) break;
        const vp = normViewport(phase.nx, phase.ny);
        if (!vp) break;
        g.lastX = vp.x;
        g.lastY = vp.y;
        if (g.pendingDown) {
          g.pendingDown = false;
          dispatchPointer("pointerdown", g.dragTarget, vp.x, vp.y, 1);
          // Fire the seam START only once the drag actually begins (first move),
          // so a grab dropped before any move never emits an orphaned start/end.
          dispatchGestureInteraction({
            widgetId: g.widgetId,
            kind: g.kind,
            active: true,
          });
        } else {
          dispatchPointer("pointermove", g.dragTarget, vp.x, vp.y, 1);
        }
        break;
      }
      case "grabEnd": {
        const g = grab.current;
        grab.current = null;
        if (g?.dragTarget && !g.pendingDown) {
          dispatchPointer("pointerup", g.dragTarget, g.lastX, g.lastY, 0);
          dispatchGestureInteraction({
            widgetId: g.widgetId,
            kind: g.kind,
            active: false,
          });
        }
        break;
      }

      // Open-hand resize → live widget resize via the existing store setter.
      // Gated OFF while a grab-drag is active (belt-and-suspenders: the gesture
      // layer already makes pinch/open mutually exclusive) so a stray resize
      // never fights a drag. Scale is cumulative from the arm baseline, so we
      // multiply the widget's arm-time w/h; clampToStage floors it at 0.16.
      case "resizeStart": {
        if (grab.current) {
          resize.current = null;
          break;
        }
        const w = getWidgetWindows().find((item) => item.id === phase.targetId);
        resize.current = w ? { id: w.id, w0: w.w, h0: w.h } : null;
        if (resize.current) {
          setResizeAffordance(resize.current.id, true);
          dispatchGestureInteraction({
            widgetId: resize.current.id,
            kind: "resize",
            active: true,
          });
        }
        break;
      }
      case "resizeMove": {
        const r = resize.current;
        if (!r) break;
        resizeWidget(r.id, r.w0 * phase.scale, r.h0 * phase.scale);
        break;
      }
      case "resizeEnd": {
        if (resize.current) {
          setResizeAffordance(resize.current.id, false);
          dispatchGestureInteraction({
            widgetId: resize.current.id,
            kind: "resize",
            active: false,
          });
        }
        resize.current = null;
        break;
      }

      // Index-finger scroll. Resolve the surface at the reticle once on start: a
      // live promoted browser routes to the child-webview IPC; every other DOM
      // surface takes a synthesized WheelEvent at the cursor. `dy` is an
      // incremental per-frame wheel delta (positive = scroll down).
      case "scrollStart": {
        const vp = cursorViewport();
        if (!vp) {
          scroll.current = null;
          break;
        }
        const nativeLabel = nativeWebviewLabelAt(vp.x, vp.y);
        scroll.current = {
          nativeLabel,
          domTarget: nativeLabel ? null : document.elementFromPoint(vp.x, vp.y),
          lastX: vp.x,
          lastY: vp.y,
        };
        break;
      }
      case "scrollMove": {
        const s = scroll.current;
        if (!s) break;
        const vp = cursorViewport();
        if (vp) {
          s.lastX = vp.x;
          s.lastY = vp.y;
        }
        // Re-resolve the native target if promotion completed mid-scroll: a
        // surface that was a DOM placeholder at scrollStart may now be a live
        // child webview. Once native, stay native for the rest of the gesture.
        if (!s.nativeLabel) {
          const nowNative = nativeWebviewLabelAt(s.lastX, s.lastY);
          if (nowNative) {
            s.nativeLabel = nowNative;
            s.domTarget = null;
          }
        }
        if (s.nativeLabel) {
          // Pass the widget-content-relative point so the child scrolls the
          // scrollable element under the reticle (custom scroll containers), not
          // just the document.
          const local = nativeWebviewLocalPoint(s.nativeLabel, s.lastX, s.lastY);
          void scrollNativeWebview(
            s.nativeLabel,
            0,
            phase.dy,
            local?.x,
            local?.y,
          ).catch(() => undefined);
        } else if (s.domTarget) {
          dispatchWheel(s.domTarget, s.lastX, s.lastY, phase.dy);
        }
        break;
      }
      case "scrollEnd": {
        scroll.current = null;
        break;
      }

      default:
        // drag* phases (camera-nav over empty space) have no desktop analog.
        break;
    }
  });

  // Click intents → a press at the reticle: summon a tile, restore a chip, or
  // click a widget button / drawer entry / news row. `tap` (quick-pinch) is the
  // primary click; `expand` (legacy pinch-bloom) is kept alongside it — both
  // synthesize the same pointerdown→up→click through the widget DOM's own
  // handlers, so everything hittable responds. A tap over a LIVE promoted child
  // webview routes to the `studio_webview_click` IPC instead (same
  // `[data-native-webview-active]` discrimination the scroll path uses), since
  // the OS child webview is not in this document and no synthetic DOM event can
  // reach it. `confirmApprove`/`confirmCancel` (thumbs-up/down) answer the send
  // confirm gate directly. collapse/swipe drive reticle pulses only.
  useStudioIntent((intent) => {
    if (intent.type === "confirmApprove") {
      confirmPendingSend();
      return;
    }
    if (intent.type === "confirmCancel") {
      cancelPendingSend();
      return;
    }
    if (intent.type !== "expand" && intent.type !== "tap") return;
    const vp = cursorViewport();
    if (!vp) return;
    // Native child webview under the reticle → click over IPC in widget-content
    // coords; a synthesized DOM click can't reach an OS-level child webview.
    const nativeLabel = nativeWebviewLabelAt(vp.x, vp.y);
    if (nativeLabel) {
      const local = nativeWebviewLocalPoint(nativeLabel, vp.x, vp.y);
      if (local) {
        void clickNativeWebview(nativeLabel, local.x, local.y).catch(
          () => undefined,
        );
      }
      return;
    }
    const hit = hitTest(vp.x, vp.y);
    if (!hit) return;
    dispatchPointer("pointerdown", hit.pressTarget, vp.x, vp.y, 1);
    dispatchPointer("pointerup", hit.pressTarget, vp.x, vp.y, 0);
    dispatchClick(hit.pressTarget, vp.x, vp.y);
  });
}
