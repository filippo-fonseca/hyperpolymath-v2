/**
 * pointer-synth core — the framework-free DOM decisions behind the hand pointer
 * synthesis. Kept out of `pointer-synth.ts` (a React hook) so the hit-testing,
 * native-vs-DOM discrimination, resize-zone detection, and the
 * gesture-interaction seam are unit-testable in a plain Node env with a minimal
 * DOM stub — no jsdom, no React render. The hook wires these into the hub's
 * intent/phase buses and dispatches the actual events.
 *
 * These functions read `document`/`window` globals but touch nothing React and
 * hold no state, so a test only needs to stub `document.elementFromPoint`,
 * `document.querySelector`, `window.dispatchEvent`, `CustomEvent`, and `CSS`.
 */

export type Hit = {
  /** Stable-ish id (widget id / "drawer") gating grab/expand + the reticle snap. */
  id: string;
  /** Element a press (click) is dispatched onto. */
  pressTarget: Element;
  /** Element a pointer-drag begins on (a widget header / orb root / drawer tile). */
  dragTarget: Element | null;
  /**
   * The widget's resize-handle element when the reticle sits in its bottom-right
   * resize zone, else null. A pinch-grab that begins here is a RESIZE drag (it
   * dispatches onto this handle, which runs the widget's own resize logic)
   * rather than a move — the pinch-corner-resize, reusing the trusted pinch
   * machine end-to-end with no separate gesture.
   */
  resizeTarget: Element | null;
};

/**
 * The bottom-right resize hot-zone (px), a touch larger than the 20px handle so
 * a frozen reticle needn't land pixel-perfect on it.
 */
export const RESIZE_ZONE_PX = 28;

/** Hit-test the real widget DOM at a viewport point. Returns null over empty space. */
export function hitTest(vx: number, vy: number): Hit | null {
  const el = document.elementFromPoint(vx, vy);
  if (!el) return null;
  const widget = el.closest("[data-widget-window]");
  if (widget) {
    // Normal widgets drag by their header; the permanent orb has none → drag root.
    const header = widget.querySelector(":scope > header");
    // Resize handle (bottom-right). Present on non-permanent widgets only. Treat
    // the reticle as "on the handle" when it is within RESIZE_ZONE_PX of the
    // widget's bottom-right corner, so a pinch-grab there resizes.
    const resizeBtn = widget.querySelector<HTMLElement>(
      'button[aria-label="Resize window"]',
    );
    let resizeTarget: Element | null = null;
    if (resizeBtn) {
      const wr = widget.getBoundingClientRect();
      if (vx >= wr.right - RESIZE_ZONE_PX && vy >= wr.bottom - RESIZE_ZONE_PX) {
        resizeTarget = resizeBtn;
      }
    }
    return {
      id: widget.getAttribute("data-widget-window") ?? "widget",
      pressTarget: el,
      dragTarget: header ?? widget,
      resizeTarget,
    };
  }
  const drawer = el.closest("[data-widget-drawer]");
  if (drawer) {
    const button = el.closest("button");
    return { id: "drawer", pressTarget: button ?? el, dragTarget: button, resizeTarget: null };
  }
  return null;
}

/**
 * A live child webview label under the point, or null. A promoted BrowserWidget
 * tags its placeholder `data-native-webview-active={id}` only while the OS-level
 * child webview is active; scroll/click for such a surface must route to the
 * `studio_webview_*` IPC, since the child webview is not in this document and no
 * synthesized DOM event can reach it.
 */
export function nativeWebviewLabelAt(vx: number, vy: number): string | null {
  const el = document.elementFromPoint(vx, vy);
  const marker = el?.closest<HTMLElement>("[data-native-webview-active]");
  return marker?.dataset.nativeWebviewActive ?? null;
}

/**
 * Convert a viewport point to a promoted child webview's CONTENT-relative logical
 * pixel point, or null when the content element for `label` is gone. The child
 * webview's bounds are set from `[data-native-webview-content]`'s rect, so its
 * own `(0,0)` is that element's top-left — subtract it to hand the child the
 * point in ITS coordinate space for `elementFromPoint`.
 */
export function nativeWebviewLocalPoint(
  label: string,
  vx: number,
  vy: number,
): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(
    `[data-native-webview-content="${CSS.escape(label)}"]`,
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: vx - r.left, y: vy - r.top };
}

/**
 * The window CustomEvent the hand pointer-synth fires at the START and END of a
 * widget-scoped grab (move) or resize, so an interested listener (U3) can react
 * to "the user is hand-manipulating this widget" without coupling to the input
 * internals. Fire-and-forget; `detail.active` is true on start, false on end.
 */
export const GESTURE_INTERACTION_EVENT = "studio:gesture-interaction";

export type GestureInteractionDetail = {
  widgetId: string;
  kind: "resize" | "drag";
  active: boolean;
};

/** Fire the gesture-interaction seam CustomEvent on `window` (no-op on SSR). */
export function dispatchGestureInteraction(detail: GestureInteractionDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<GestureInteractionDetail>(GESTURE_INTERACTION_EVENT, { detail }),
  );
}
