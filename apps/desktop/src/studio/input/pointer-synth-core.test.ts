import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dispatchGestureInteraction,
  GESTURE_INTERACTION_EVENT,
  hitTest,
  nativeWebviewLabelAt,
  nativeWebviewLocalPoint,
  type GestureInteractionDetail,
} from "./pointer-synth-core";

/**
 * Minimal fake DOM. Each node is a plain object implementing just the surface
 * pointer-synth-core reads: closest (by selector), querySelector, getAttribute,
 * getBoundingClientRect, and dataset. No jsdom needed.
 */
type FakeEl = {
  selectors: string[]; // which `closest` selectors this node matches
  attrs: Record<string, string>;
  dataset: Record<string, string>;
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  children: Record<string, FakeEl | null>; // querySelector answers by selector
  closest(sel: string): FakeEl | null;
  querySelector(sel: string): FakeEl | null;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): DOMRect;
};

function el(opts: Partial<FakeEl> & { selectors?: string[] }): FakeEl {
  const node: FakeEl = {
    selectors: opts.selectors ?? [],
    attrs: opts.attrs ?? {},
    dataset: opts.dataset ?? {},
    rect: opts.rect ?? { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
    children: opts.children ?? {},
    closest(sel: string) {
      return this.selectors.includes(sel) ? this : null;
    },
    querySelector(sel: string) {
      return this.children[sel] ?? null;
    },
    getAttribute(name: string) {
      return this.attrs[name] ?? null;
    },
    getBoundingClientRect() {
      return this.rect as unknown as DOMRect;
    },
  };
  return node;
}

let elementFromPointReturn: FakeEl | null = null;
let querySelectorMap: Record<string, FakeEl | null> = {};

beforeEach(() => {
  elementFromPointReturn = null;
  querySelectorMap = {};
  (globalThis as unknown as { document: unknown }).document = {
    elementFromPoint: () => elementFromPointReturn,
    querySelector: (sel: string) => querySelectorMap[sel] ?? null,
  };
  (globalThis as unknown as { CSS: unknown }).CSS = { escape: (s: string) => s };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hitTest — target discrimination", () => {
  it("returns a widget hit with header dragTarget", () => {
    const header = el({ selectors: [":scope > header"] });
    const widget = el({
      selectors: ["[data-widget-window]"],
      attrs: { "data-widget-window": "w1" },
      rect: { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 },
      children: {
        ":scope > header": header,
      },
    });
    elementFromPointReturn = widget;
    const hit = hitTest(50, 50);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe("w1");
    expect(hit!.dragTarget).toBe(header);
  });

  it("returns a drawer hit", () => {
    const button = el({ selectors: ["button"] });
    const drawer = el({
      selectors: ["[data-widget-drawer]", "button"],
      children: {},
    });
    // Make closest("button") resolve to the button and drawer to the drawer.
    drawer.closest = (sel: string) => {
      if (sel === "[data-widget-drawer]") return drawer;
      if (sel === "button") return button;
      return null;
    };
    elementFromPointReturn = drawer;
    const hit = hitTest(10, 10);
    expect(hit!.id).toBe("drawer");
    // The enclosing button (not the hit element) is the press + drag target.
    expect(hit!.pressTarget).toBe(button);
    expect(hit!.dragTarget).toBe(button);
  });

  it("falls back to the hit element when a drawer hit has no enclosing button", () => {
    const bare = el({ selectors: ["[data-widget-drawer]"] });
    // closest("[data-widget-drawer]") → self; closest("button") → null.
    bare.closest = (sel: string) => (sel === "[data-widget-drawer]" ? bare : null);
    elementFromPointReturn = bare;
    const hit = hitTest(10, 10);
    expect(hit!.id).toBe("drawer");
    expect(hit!.pressTarget).toBe(bare);
    expect(hit!.dragTarget).toBeNull();
  });

  it("drags a widget by its root when it has no header (the permanent orb)", () => {
    const widget = el({
      selectors: ["[data-widget-window]"],
      attrs: { "data-widget-window": "orb" },
      // No ':scope > header' child (permanent orb).
      children: {},
    });
    elementFromPointReturn = widget;
    const hit = hitTest(10, 10);
    expect(hit!.dragTarget).toBe(widget);
  });

  it("returns null over empty space", () => {
    elementFromPointReturn = null;
    expect(hitTest(10, 10)).toBeNull();
  });
});

describe("nativeWebviewLabelAt — native-vs-DOM discrimination", () => {
  it("returns the active native webview label when present", () => {
    const marker = el({
      selectors: ["[data-native-webview-active]"],
      dataset: { nativeWebviewActive: "browser-42" },
    });
    elementFromPointReturn = marker;
    expect(nativeWebviewLabelAt(5, 5)).toBe("browser-42");
  });

  it("returns null when the surface is not a live native webview", () => {
    elementFromPointReturn = el({ selectors: [] }); // matches nothing
    expect(nativeWebviewLabelAt(5, 5)).toBeNull();
  });
});

describe("nativeWebviewLocalPoint — widget-content-relative coords", () => {
  it("subtracts the content rect origin", () => {
    querySelectorMap['[data-native-webview-content="lbl"]'] = el({
      rect: { left: 40, top: 60, right: 340, bottom: 460, width: 300, height: 400 },
    });
    const p = nativeWebviewLocalPoint("lbl", 100, 150);
    expect(p).toEqual({ x: 60, y: 90 });
  });

  it("returns null when the content element is gone", () => {
    expect(nativeWebviewLocalPoint("missing", 1, 1)).toBeNull();
  });
});

describe("dispatchGestureInteraction — the U3 seam", () => {
  it("fires a studio:gesture-interaction CustomEvent on window with the detail", () => {
    const received: GestureInteractionDetail[] = [];
    const dispatchEvent = vi.fn((ev: Event) => {
      received.push((ev as CustomEvent<GestureInteractionDetail>).detail);
      return true;
    });
    (globalThis as unknown as { window: unknown }).window = { dispatchEvent };
    (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    };

    // Grab (drag) start, then end — the two edges of a widget-scoped manipulation.
    dispatchGestureInteraction({ widgetId: "w9", kind: "drag", active: true });
    dispatchGestureInteraction({ widgetId: "w9", kind: "drag", active: false });
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls[0]![0]!.type).toBe(GESTURE_INTERACTION_EVENT);
    expect(received[0]).toEqual({ widgetId: "w9", kind: "drag", active: true });
    expect(received[1]).toEqual({ widgetId: "w9", kind: "drag", active: false });

    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("is a no-op on SSR (no window global)", () => {
    // Ensure no `window` leaks in from a sibling test → the SSR guard returns
    // without throwing (and without a dispatch target).
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(() =>
      dispatchGestureInteraction({ widgetId: "w1", kind: "drag", active: true }),
    ).not.toThrow();
  });
});
