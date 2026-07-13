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
 * the hand-gesture pipeline (unit U4) around a gesture-driven resize/drag. The
 * gesture path mutates the widget-windows store directly (via pointer-synth
 * `resizeWidget`/`moveWidget`), so it never fires the real header/resize-handle
 * PointerEvents the pointerdown guard watches. This event lets the native
 * webview hide during the gesture and re-show once bounds settle.
 */
export interface GestureInteractionDetail {
  widgetId: string;
  kind: "resize" | "drag";
  active: boolean;
}

/** Window event name for gesture-driven widget resize/drag interactions. */
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
): Promise<void> {
  return invoke("studio_webview_create", { label, url, ...bounds });
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
 * Scroll a promoted child webview by an in-page pixel delta. Runs
 * `window.scrollBy(dx, dy)` inside the child webview over IPC — the only way to
 * reach a native OS webview, which sits outside the host DOM and so cannot
 * receive a synthesized `WheelEvent` from the hand pointer-synth. Deltas are
 * logical (CSS) pixels; batch per animation frame at the call site.
 */
export function scrollNativeWebview(
  label: string,
  dx: number,
  dy: number,
): Promise<void> {
  return invoke("studio_webview_scroll", { label, dx, dy });
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
    if (!enabled || typeof document === "undefined") return;
    let pointerId: number | null = null;
    let cancelled = false;
    let animationFrame = 0;

    const widgetFrame = (target: EventTarget | null): HTMLElement | null => {
      const element = target instanceof Element ? target : null;
      const frame = element?.closest<HTMLElement>("[data-widget-window]") ?? null;
      return frame?.dataset.widgetWindow === id ? frame : null;
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const frame = widgetFrame(event.target);
      if (!frame) return;
      const target = event.target instanceof Element ? event.target : null;
      const onResizeHandle =
        target?.closest('button[aria-label="Resize window"]')?.parentElement === frame;
      const onHeader =
        target?.closest("header")?.parentElement === frame &&
        !target?.closest("button, a, input, select, textarea");
      if (!onHeader && !onResizeHandle) return;
      pointerId = event.pointerId;
      void hideNativeWebview(id).catch(() => undefined);
    };

    const finishInteraction = (event: PointerEvent): void => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(() => {
          if (cancelled) return;
          const element = Array.from(
            document.querySelectorAll<HTMLElement>("[data-native-webview-content]"),
          ).find((candidate) => candidate.dataset.nativeWebviewContent === id);
          if (!element) return;
          void physicalWebviewBounds(element.getBoundingClientRect())
            .then((bounds) => setNativeWebviewBounds(id, bounds))
            .catch(() => undefined)
            .finally(() => {
              if (!cancelled) void showNativeWebview(id).catch(() => undefined);
            });
        });
      });
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", finishInteraction);
    document.addEventListener("pointercancel", finishInteraction);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", finishInteraction);
      document.removeEventListener("pointercancel", finishInteraction);
    };
  }, [id, enabled]);
}
