import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn((..._args: unknown[]) => Promise.resolve());

// The module imports the Tauri core/window APIs at load time. Desktop unit tests
// run in a plain Node env, so stub them; the window API's scaleFactor rejects,
// letting `physicalWebviewBounds` fall back to `window.devicePixelRatio`.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    scaleFactor: () => Promise.reject(new Error("no tauri window in test")),
  }),
}));

import {
  attachNativeWebviewInteraction,
  GESTURE_INTERACTION_EVENT,
  toPhysicalWebviewBounds,
  type GestureInteractionDetail,
} from "./native-webview";

describe("native webview bounds", () => {
  it("converts logical content coordinates to physical pixels", () => {
    expect(
      toPhysicalWebviewBounds(
        { left: 10.25, top: 20.5, width: 300.25, height: 199.75 },
        2,
      ),
    ).toEqual({ x: 21, y: 41, w: 600, h: 399 });
  });

  it("guards invalid scale factors and zero-sized transitional rects", () => {
    expect(
      toPhysicalWebviewBounds({ left: 4, top: 8, width: 0, height: 0 }, Number.NaN),
    ).toEqual({ x: 4, y: 8, w: 1, h: 1 });
  });

  it("never overhangs the frame at fractional DPR (clamp far edge inward)", () => {
    // Independently rounding position and size can push x+w one physical pixel
    // past the placeholder rect. The clamp ceils the near edge and floors the
    // far edge, so x+w <= physical-right and y+h <= physical-bottom always. A
    // <=1px underhang is invisible; a >0 overhang is the defect we forbid.
    for (const scale of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      const rect = { left: 12.4, top: 7.9, width: 301.3, height: 200.7 };
      const bounds = toPhysicalWebviewBounds(rect, scale);
      const physRight = (rect.left + rect.width) * scale;
      const physBottom = (rect.top + rect.height) * scale;
      expect(bounds.x + bounds.w).toBeLessThanOrEqual(physRight);
      expect(bounds.y + bounds.h).toBeLessThanOrEqual(physBottom);
      expect(physRight - (bounds.x + bounds.w)).toBeLessThan(2);
      expect(physBottom - (bounds.y + bounds.h)).toBeLessThan(2);
    }
  });
});

// Minimal DOM shim: enough of window/document for attachNativeWebviewInteraction
// to register listeners and dispatch synthetic events in the Node test env.
interface Listener {
  type: string;
  fn: (event: unknown) => void;
}

function installDomShim(): {
  dispatchGesture: (detail: GestureInteractionDetail) => void;
  restore: () => void;
} {
  const windowListeners: Listener[] = [];
  const documentListeners: Listener[] = [];
  let rafId = 0;

  const win = {
    devicePixelRatio: 2,
    requestAnimationFrame: (cb: (t: number) => void): number => {
      // Run synchronously so the double-rAF settle resolves within the test.
      cb(0);
      return ++rafId;
    },
    cancelAnimationFrame: (): void => undefined,
    addEventListener: (type: string, fn: (e: unknown) => void): void => {
      windowListeners.push({ type, fn });
    },
    removeEventListener: (type: string, fn: (e: unknown) => void): void => {
      const idx = windowListeners.findIndex((l) => l.type === type && l.fn === fn);
      if (idx >= 0) windowListeners.splice(idx, 1);
    },
  };

  const doc = {
    addEventListener: (type: string, fn: (e: unknown) => void): void => {
      documentListeners.push({ type, fn });
    },
    removeEventListener: (type: string, fn: (e: unknown) => void): void => {
      const idx = documentListeners.findIndex((l) => l.type === type && l.fn === fn);
      if (idx >= 0) documentListeners.splice(idx, 1);
    },
    // No placeholder element in the shim → settleAndShow re-shows without a
    // bounds round-trip, which is exactly the path we assert re-shows.
    querySelectorAll: (): never[] => [],
  };

  const globalRef = globalThis as unknown as {
    window?: unknown;
    document?: unknown;
  };
  const prevWindow = globalRef.window;
  const prevDocument = globalRef.document;
  globalRef.window = win;
  globalRef.document = doc;

  return {
    dispatchGesture: (detail: GestureInteractionDetail): void => {
      const event = { type: GESTURE_INTERACTION_EVENT, detail };
      for (const l of windowListeners) {
        if (l.type === GESTURE_INTERACTION_EVENT) l.fn(event);
      }
    },
    restore: (): void => {
      globalRef.window = prevWindow;
      globalRef.document = prevDocument;
    },
  };
}

describe("attachNativeWebviewInteraction gesture guard", () => {
  let shim: ReturnType<typeof installDomShim>;
  let detach: (() => void) | undefined;

  beforeEach(() => {
    invokeMock.mockClear();
    shim = installDomShim();
  });

  afterEach(() => {
    detach?.();
    detach = undefined;
    shim.restore();
  });

  const commands = (): string[] =>
    invokeMock.mock.calls.map((call) => String(call[0]));

  it("hides the child webview when a gesture for its id becomes active", async () => {
    detach = attachNativeWebviewInteraction("widget-a");
    invokeMock.mockClear();
    shim.dispatchGesture({ widgetId: "widget-a", kind: "drag", active: true });
    await Promise.resolve();
    expect(commands()).toContain("studio_webview_hide");
  });

  it("ignores gestures targeting a different widget id", async () => {
    detach = attachNativeWebviewInteraction("widget-a");
    invokeMock.mockClear();
    shim.dispatchGesture({ widgetId: "widget-b", kind: "drag", active: true });
    await Promise.resolve();
    expect(commands()).not.toContain("studio_webview_hide");
  });

  it("re-shows the child webview after the gesture settles", async () => {
    detach = attachNativeWebviewInteraction("widget-a");
    invokeMock.mockClear();
    shim.dispatchGesture({ widgetId: "widget-a", kind: "drag", active: true });
    shim.dispatchGesture({ widgetId: "widget-a", kind: "drag", active: false });
    // Flush the settle promise chain (finally re-shows).
    await Promise.resolve();
    await Promise.resolve();
    expect(commands()).toContain("studio_webview_show");
  });

  it("does not re-show a gesture that never went active (spurious end)", async () => {
    detach = attachNativeWebviewInteraction("widget-a");
    invokeMock.mockClear();
    shim.dispatchGesture({ widgetId: "widget-a", kind: "drag", active: false });
    await Promise.resolve();
    expect(commands()).not.toContain("studio_webview_show");
  });

  it("detaching removes the gesture listener", async () => {
    detach = attachNativeWebviewInteraction("widget-a");
    detach();
    detach = undefined;
    invokeMock.mockClear();
    shim.dispatchGesture({ widgetId: "widget-a", kind: "drag", active: true });
    await Promise.resolve();
    expect(commands()).not.toContain("studio_webview_hide");
  });
});
