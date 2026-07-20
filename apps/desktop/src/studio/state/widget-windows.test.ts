import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetWidgetWindows,
  closeAll,
  closeWidget,
  closeWidgetsByKind,
  focusWidget,
  getWidgetWindows,
  moveWidget,
  rehydrateWidgetWindows,
  resizeWidget,
  resyncWidgetSizes,
  summonWidget,
} from "./widget-windows";
import { currentViewport, widgetSizeFor } from "../windows/size-ladder";

const STORAGE_KEY = "studio:widget-windows:v1";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

beforeEach(() => {
  __resetWidgetWindows();
  storage.clear();
  rehydrateWidgetWindows();
});

describe("widget window store", () => {
  it("summons, clamps, focuses, closes, and persists windows", () => {
    const browserId = summonWidget(
      "browser",
      { url: "https://example.com" },
      { x: 0.5, y: 0.48 },
    );
    const weatherId = summonWidget("weather", {}, undefined, {
      singleton: true,
    });

    moveWidget(browserId, -10, 10);
    resizeWidget(browserId, 2, 0.01);
    const browser = getWidgetWindows().find((item) => item.id === browserId)!;
    expect(browser.w).toBeCloseTo(0.976);
    expect(browser.h).toBe(0.16);
    expect(browser.x).toBeCloseTo(0.5);
    // y was pushed to the stage floor by the earlier move at the widget's
    // ladder-derived spawn height (h≈0.6), then the resize shrank h without
    // moving the already-clamped center: 1 - 0.6/2 - 0.012 = 0.688.
    expect(browser.y).toBeCloseTo(0.688);

    const browserZ = browser.z;
    focusWidget(browserId);
    expect(getWidgetWindows().find((item) => item.id === browserId)?.z).toBeGreaterThan(
      browserZ,
    );

    closeWidget(weatherId);
    expect(getWidgetWindows()).toHaveLength(1);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(1);
  });

  it("reuses singleton widgets and restores persisted geometry", () => {
    const first = summonWidget("weather", {}, undefined, {
      singleton: true,
    });
    const second = summonWidget("weather", { ignored: true }, undefined, {
      singleton: true,
    });
    expect(second).toBe(first);
    expect(getWidgetWindows()).toHaveLength(1);

    moveWidget(first, 0.7, 0.6);
    __resetWidgetWindows();
    rehydrateWidgetWindows();

    expect(getWidgetWindows()).toHaveLength(1);
    expect(getWidgetWindows()[0]).toMatchObject({
      id: first,
      kind: "weather",
      x: 0.7,
      y: 0.6,
    });
  });

  it("closing a widget removes the instance and persists the removal", () => {
    const id = summonWidget(
      "browser",
      { url: "https://example.com/path" },
      { x: 0.4, y: 0.4 },
    );
    expect(getWidgetWindows()).toHaveLength(1);

    closeWidget(id);
    expect(getWidgetWindows()).toHaveLength(0);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(0);
  });

  it("drops legacy persisted stowed records on rehydrate (#307)", () => {
    const kept = summonWidget("browser", {}, { x: 0.4, y: 0.4 });
    const dropped = summonWidget("weather", {}, { x: 0.6, y: 0.6 });
    const persisted = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]") as Array<
      Record<string, unknown>
    >;
    // Simulate a pre-#307 persisted layout where one instance was stowed.
    for (const record of persisted) {
      if (record.id === dropped) record.stowed = true;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    __resetWidgetWindows();
    rehydrateWidgetWindows();

    const ids = getWidgetWindows().map((item) => item.id);
    expect(ids).toContain(kept);
    expect(ids).not.toContain(dropped);
    // The surviving record no longer carries a stowed field.
    expect(getWidgetWindows()[0]).not.toHaveProperty("stowed");
  });

  it("spawns each kind at its ladder size for the current viewport", () => {
    const browserId = summonWidget("browser", {}, { x: 0.5, y: 0.5 });
    const clockId = summonWidget("clock", {}, { x: 0.5, y: 0.5 });
    const browser = getWidgetWindows().find((item) => item.id === browserId)!;
    const clock = getWidgetWindows().find((item) => item.id === clockId)!;
    const expectBrowser = widgetSizeFor(currentViewport(), "browser");
    expect(browser.w).toBeCloseTo(expectBrowser.w);
    expect(browser.h).toBeCloseTo(expectBrowser.h);
    // The media widget is larger than the utility one on the same viewport.
    expect(browser.w).toBeGreaterThan(clock.w);
  });

  it("resyncWidgetSizes re-derives non-orb sizes and leaves the orb", () => {
    const orbId = summonWidget("orb", {}, { x: 0.5, y: 0.5 }, {
      singleton: true,
    });
    const browserId = summonWidget("browser", {}, { x: 0.5, y: 0.5 });
    // Simulate stale free-form geometry from a pre-#316 persisted layout.
    resizeWidget(browserId, 0.9, 0.85);
    const orbBefore = getWidgetWindows().find((item) => item.id === orbId)!;

    resyncWidgetSizes();

    const browser = getWidgetWindows().find((item) => item.id === browserId)!;
    const expected = widgetSizeFor(currentViewport(), "browser");
    expect(browser.w).toBeCloseTo(expected.w);
    expect(browser.h).toBeCloseTo(expected.h);
    // The orb owns its own geometry, so resync must not touch it.
    const orbAfter = getWidgetWindows().find((item) => item.id === orbId)!;
    expect(orbAfter.w).toBe(orbBefore.w);
    expect(orbAfter.h).toBe(orbBefore.h);
  });

  it("re-derives fixed sizes on rehydrate, ignoring stale persisted w/h", () => {
    // Centered so a stale oversized w/h can't shift x when it's clamped in.
    const browserId = summonWidget("browser", {}, { x: 0.5, y: 0.5 });
    // Persist a stale free-form size the way a pre-#316 build would have.
    resizeWidget(browserId, 0.92, 0.9);
    __resetWidgetWindows();
    rehydrateWidgetWindows();

    const browser = getWidgetWindows().find((item) => item.id === browserId)!;
    const expected = widgetSizeFor(currentViewport(), "browser");
    expect(browser.w).toBeCloseTo(expected.w);
    expect(browser.h).toBeCloseTo(expected.h);
    // Position is preserved across the rehydrate.
    expect(browser.x).toBeCloseTo(0.5);
  });

  it("refuses every close path for permanent widgets", () => {
    const orbId = summonWidget("orb", {}, { x: 0.5, y: 0.5 }, {
      singleton: true,
    });
    const browserId = summonWidget("browser");

    closeWidget(orbId);
    closeWidgetsByKind("orb");
    expect(getWidgetWindows().some((item) => item.id === orbId)).toBe(true);

    closeAll();
    expect(getWidgetWindows()).toEqual([
      expect.objectContaining({ id: orbId, kind: "orb" }),
    ]);
    expect(getWidgetWindows().some((item) => item.id === browserId)).toBe(false);
  });
});
