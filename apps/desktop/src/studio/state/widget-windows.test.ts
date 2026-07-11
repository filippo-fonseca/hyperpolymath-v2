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
  restoreWidget,
  stowWidget,
  summonWidget,
} from "./widget-windows";

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
      { defaultSize: { w: 0.42, h: 0.5 } },
    );
    const weatherId = summonWidget("weather", {}, undefined, {
      defaultSize: { w: 0.28, h: 0.31 },
      singleton: true,
    });

    moveWidget(browserId, -10, 10);
    resizeWidget(browserId, 2, 0.01);
    const browser = getWidgetWindows().find((item) => item.id === browserId)!;
    expect(browser.w).toBeCloseTo(0.976);
    expect(browser.h).toBe(0.16);
    expect(browser.x).toBeCloseTo(0.5);
    expect(browser.y).toBeCloseTo(0.738);

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
      defaultSize: { w: 0.28, h: 0.31 },
    });
    const second = summonWidget("weather", { ignored: true }, undefined, {
      singleton: true,
      defaultSize: { w: 0.28, h: 0.31 },
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
      stowed: false,
    });
  });

  it("stows and restores a widget without losing props or geometry", () => {
    const id = summonWidget(
      "browser",
      { url: "https://example.com/path" },
      { x: 0.4, y: 0.4 },
    );

    stowWidget(id);
    expect(getWidgetWindows()[0]).toMatchObject({
      id,
      stowed: true,
      props: { url: "https://example.com/path" },
      x: 0.4,
      y: 0.4,
    });

    restoreWidget(id, { x: 0.7, y: 0.6 });
    expect(getWidgetWindows()[0]).toMatchObject({
      id,
      stowed: false,
      props: { url: "https://example.com/path" },
      x: 0.7,
      y: 0.6,
    });
  });

  it("defaults legacy persisted records to not stowed", () => {
    const id = summonWidget("browser");
    const legacy = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]") as Array<
      Record<string, unknown>
    >;
    delete legacy[0]?.stowed;
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    __resetWidgetWindows();
    rehydrateWidgetWindows();

    expect(getWidgetWindows()).toMatchObject([{ id, stowed: false }]);
  });

  it("restores an existing stowed singleton when summoned again", () => {
    const id = summonWidget("weather", { city: "Paris" }, undefined, {
      singleton: true,
    });
    stowWidget(id);

    expect(
      summonWidget("weather", {}, { x: 0.65, y: 0.55 }, { singleton: true }),
    ).toBe(id);
    expect(getWidgetWindows()).toMatchObject([
      {
        id,
        stowed: false,
        props: { city: "Paris" },
        x: 0.65,
        y: 0.55,
      },
    ]);
  });

  it("restores without a position at an available spawn point", () => {
    const first = summonWidget("browser", {}, { x: 0.5, y: 0.48 });
    const second = summonWidget("browser", {}, { x: 0.22, y: 0.22 });
    stowWidget(second);

    restoreWidget(second);

    const restored = getWidgetWindows().find((item) => item.id === second)!;
    expect(restored.stowed).toBe(false);
    expect({ x: restored.x, y: restored.y }).not.toEqual({ x: 0.22, y: 0.22 });
    expect(restored.z).toBeGreaterThan(
      getWidgetWindows().find((item) => item.id === first)!.z,
    );
  });

  it("refuses every close path for permanent widgets", () => {
    const orbId = summonWidget("orb", {}, { x: 0.5, y: 0.5 }, {
      singleton: true,
      defaultSize: { w: 0.25, h: 0.4 },
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
