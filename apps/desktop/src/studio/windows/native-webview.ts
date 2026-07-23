import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

export interface NativeWebviewBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Detail of the `studio:gesture-interaction` window CustomEvent, dispatched by
 * the hand-gesture pipeline (unit U4) around a gesture-driven drag. The gesture
 * path drives the widget's own pointer handlers via pointer-synth, so it never
 * fires the real header PointerEvents the pointerdown guard watches. This event
 * lets the native webview hide during the drag and re-show once bounds settle.
 */
export interface GestureInteractionDetail {
  widgetId: string;
  kind: "drag";
  active: boolean;
}

/** Window event name for gesture-driven widget drag interactions. */
export const GESTURE_INTERACTION_EVENT = "studio:gesture-interaction";

export function toPhysicalWebviewBounds(
  rect: ContentRect,
  scaleFactor: number,
): NativeWebviewBounds {
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  // Clamp so the physical box never spills past the frame's true physical edges.
  // At fractional DPR, independently rounding position and size can push
  // `x + w` (or `y + h`) one physical pixel beyond the placeholder rect, so the
  // child webview overhangs its DOM frame. Instead: ceil the near edge, floor
  // the far edge, and take the size as the (non-negative) gap between them. A
  // ≤1px underhang is invisible; a ≤1px overhang is the defect we forbid.
  const left = Math.ceil(rect.left * scale);
  const top = Math.ceil(rect.top * scale);
  const right = Math.floor((rect.left + rect.width) * scale);
  const bottom = Math.floor((rect.top + rect.height) * scale);
  return {
    x: left,
    y: top,
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
  };
}

export async function physicalWebviewBounds(
  rect: ContentRect,
): Promise<NativeWebviewBounds> {
  let scaleFactor =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  try {
    scaleFactor = await getCurrentWindow().scaleFactor();
  } catch {
    // Browser-only Studio previews do not expose the Tauri window API.
  }
  return toPhysicalWebviewBounds(rect, scaleFactor);
}

export function createNativeWebview(
  label: string,
  url: string,
  bounds: NativeWebviewBounds,
  radius: number,
): Promise<void> {
  // `radius` is the widget frame's logical corner radius (SD_RADIUS.card). The
  // native child webview is composited above the HUD DOM, so CSS `overflow`
  // can't clip it; the Rust side rounds the webview's own layer to this radius.
  return invoke("studio_webview_create", { label, url, ...bounds, radius });
}

export function setNativeWebviewBounds(
  label: string,
  bounds: NativeWebviewBounds,
): Promise<void> {
  return invoke("studio_webview_set_bounds", { label, ...bounds });
}

export function showNativeWebview(label: string): Promise<void> {
  return invoke("studio_webview_show", { label });
}

export function hideNativeWebview(label: string): Promise<void> {
  return invoke("studio_webview_hide", { label });
}

export function destroyNativeWebview(label: string): Promise<void> {
  return invoke("studio_webview_destroy", { label });
}

export function navigateNativeWebview(
  label: string,
  url: string,
): Promise<void> {
  return invoke("studio_webview_navigate", { label, url });
}

/**
 * Scroll a promoted child webview by an in-page pixel delta. Runs script inside
 * the child webview over IPC — the only way to reach a native OS webview, which
 * sits outside the host DOM and so cannot receive a synthesized `WheelEvent`
 * from the hand pointer-synth. When `x`/`y` (widget-content-relative logical
 * pixels under the reticle) are given, the child scrolls the NEAREST SCROLLABLE
 * ANCESTOR of `elementFromPoint(x, y)` so a page with a custom scroll container
 * still scrolls, falling back to `window.scrollBy`. Deltas are logical (CSS)
 * pixels; batch per animation frame at the call site.
 */
export function scrollNativeWebview(
  label: string,
  dx: number,
  dy: number,
  x?: number,
  y?: number,
): Promise<void> {
  return invoke("studio_webview_scroll", { label, dx, dy, x, y });
}

/**
 * Synthesize a click inside a promoted child webview at a widget-content-relative
 * logical pixel point. Mirrors {@link scrollNativeWebview}: the OS child webview
 * is not in the host DOM, so the hand pointer-synth's DOM click can't reach it —
 * this runs script inside the child that hit-tests `elementFromPoint(x, y)`,
 * focuses it, and dispatches a full pointer/mouse click sequence. Note the
 * dispatched events are `isTrusted:false`, so some native default behaviors may
 * not fire (see the Rust command's doc-comment).
 */
export function clickNativeWebview(
  label: string,
  x: number,
  y: number,
): Promise<void> {
  return invoke("studio_webview_click", { label, x, y });
}

export function useNativeWebviewSync(
  id: string,
  contentRect: ContentRect | null,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !contentRect) return;
    let cancelled = false;
    void physicalWebviewBounds(contentRect).then((bounds) => {
      if (!cancelled) void setNativeWebviewBounds(id, bounds).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [
    id,
    enabled,
    contentRect?.left,
    contentRect?.top,
    contentRect?.width,
    contentRect?.height,
  ]);

  useEffect(() => {
    if (!enabled) return;
    return attachNativeWebviewInteraction(id);
  }, [id, enabled]);
}

/**
 * Wire the hide-on-interaction / re-show-on-settle guards for the child webview
 * `id`. Two interaction sources hide the native webview so it can't trail its
 * DOM frame while geometry changes:
 *
 *  1. Real header PointerEvents (mouse/touch drags).
 *  2. The `studio:gesture-interaction` window event dispatched by the hand-
 *     gesture pipeline (U4), which drives the drag via pointer-synth and so
 *     never fires the PointerEvents above.
 *
 * On the way out (pointerup/cancel, or gesture `active:false`) it re-measures
 * the placeholder rect and re-shows the webview after a double-rAF settle, but
 * only if no other interaction is still live. Returns a detach function.
 *
 * Extracted from `useNativeWebviewSync` so the containment logic is testable
 * without a React renderer. SSR/no-DOM guarded.
 */
export function attachNativeWebviewInteraction(id: string): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => undefined;
  }
  let pointerId: number | null = null;
  let gestureActive = false;
  let cancelled = false;
  let animationFrame = 0;

  const widgetFrame = (target: EventTarget | null): HTMLElement | null => {
    const element = target instanceof Element ? target : null;
    const frame = element?.closest<HTMLElement>("[data-widget-window]") ?? null;
    return frame?.dataset.widgetWindow === id ? frame : null;
  };

  // Re-measure the placeholder rect and re-show the child webview once the DOM
  // has settled. Double-rAF mirrors the pointer-interaction path: one frame for
  // React to commit the new geometry, a second for layout to flush before we
  // read `getBoundingClientRect`. Only re-shows if no interaction is still live.
  const settleAndShow = (): void => {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const element = Array.from(
          document.querySelectorAll<HTMLElement>("[data-native-webview-content]"),
        ).find((candidate) => candidate.dataset.nativeWebviewContent === id);
        if (!element) {
          // No placeholder to re-measure (e.g. the widget is mid-teardown), but
          // we still hid the webview on the way in — re-show it so it isn't left
          // stranded invisible.
          if (!cancelled && pointerId === null && !gestureActive) {
            void showNativeWebview(id).catch(() => undefined);
          }
          return;
        }
        void physicalWebviewBounds(element.getBoundingClientRect())
          .then((bounds) => setNativeWebviewBounds(id, bounds))
          .catch(() => undefined)
          .finally(() => {
            // A pointer drag or gesture may have started again while we were
            // settling; don't un-hide underneath a live interaction.
            if (!cancelled && pointerId === null && !gestureActive) {
              void showNativeWebview(id).catch(() => undefined);
            }
          });
      });
    });
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const frame = widgetFrame(event.target);
    if (!frame) return;
    const target = event.target instanceof Element ? event.target : null;
    const onHeader =
      target?.closest("header")?.parentElement === frame &&
      !target?.closest("button, a, input, select, textarea");
    if (!onHeader) return;
    pointerId = event.pointerId;
    void hideNativeWebview(id).catch(() => undefined);
  };

  const finishInteraction = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    settleAndShow();
  };

  // A gesture-driven drag never fires the header PointerEvents above
  // (pointer-synth drives the widget's handlers directly), so the child webview
  // would trail the frame by a frame or more. U4's gesture pipeline dispatches
  // this event; hide on active, re-show once settled.
  const onGestureInteraction = (event: Event): void => {
    const detail = (event as CustomEvent<GestureInteractionDetail>).detail;
    if (!detail || detail.widgetId !== id) return;
    if (detail.active) {
      gestureActive = true;
      void hideNativeWebview(id).catch(() => undefined);
    } else if (gestureActive) {
      gestureActive = false;
      settleAndShow();
    }
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", finishInteraction);
  document.addEventListener("pointercancel", finishInteraction);
  window.addEventListener(GESTURE_INTERACTION_EVENT, onGestureInteraction);
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(animationFrame);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointerup", finishInteraction);
    document.removeEventListener("pointercancel", finishInteraction);
    window.removeEventListener(GESTURE_INTERACTION_EVENT, onGestureInteraction);
  };
}
