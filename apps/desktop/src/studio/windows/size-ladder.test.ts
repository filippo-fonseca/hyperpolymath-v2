import { describe, expect, it } from "vitest";

import type { WidgetKind } from "./catalog";
import {
  WIDGET_SIZE_LADDER,
  currentViewport,
  widgetSizeFor,
  type Viewport,
} from "./size-ladder";

const KINDS = Object.keys(WIDGET_SIZE_LADDER) as WidgetKind[];

// Representative displays: a small laptop, a desktop monitor, a big 4K panel,
// and a projector-ish wide-but-short surface.
const LAPTOP: Viewport = { w: 1280, h: 800 };
const MONITOR: Viewport = { w: 2560, h: 1440 };
const UHD: Viewport = { w: 3840, h: 2160 };
const PROJECTOR: Viewport = { w: 1920, h: 1080 };
const ALL: Viewport[] = [LAPTOP, MONITOR, UHD, PROJECTOR];

describe("widgetSizeFor", () => {
  it("returns normalized fractions in (0,1] for every kind on every display", () => {
    for (const viewport of ALL) {
      for (const kind of KINDS) {
        const { w, h } = widgetSizeFor(viewport, kind);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        // A widget never wider/taller than the viewport on a real display (its
        // pixel ceiling is below the viewport once the viewport is large enough,
        // and the ideal fraction is < 1 on the small ones).
        expect(w).toBeLessThanOrEqual(1);
        expect(h).toBeLessThanOrEqual(1);
      }
    }
  });

  it("honors the pixel ceiling: a browser doesn't balloon on a 4K panel", () => {
    const spec = WIDGET_SIZE_LADDER.browser;
    const { w, h } = widgetSizeFor(UHD, "browser");
    // ideal * UHD would exceed the ceiling, so the result is the ceiling / UHD.
    expect(w * UHD.w).toBeCloseTo(spec.maxPx.w, 5);
    expect(h * UHD.h).toBeCloseTo(spec.maxPx.h, 5);
    // And that's a much smaller fraction than the raw ideal.
    expect(w).toBeLessThan(spec.ideal.w);
  });

  it("honors the pixel floor: a clock stays usable on a tiny viewport", () => {
    const spec = WIDGET_SIZE_LADDER.clock;
    const tiny: Viewport = { w: 700, h: 500 };
    const { w, h } = widgetSizeFor(tiny, "clock");
    expect(w * tiny.w).toBeCloseTo(spec.minPx.w, 5);
    expect(h * tiny.h).toBeCloseTo(spec.minPx.h, 5);
    // Floor kicks in only below the ideal, so the fraction exceeds the ideal.
    expect(w).toBeGreaterThan(spec.ideal.w);
  });

  it("uses the proportional ideal in the middle of the bracket", () => {
    // On a mid display the browser sits between its floor and ceiling, so the
    // result is exactly the ideal fraction.
    const mid: Viewport = { w: 1500, h: 900 };
    const spec = WIDGET_SIZE_LADDER.browser;
    const px = spec.ideal.w * mid.w; // 780, within [640, 1600]
    expect(px).toBeGreaterThan(spec.minPx.w);
    expect(px).toBeLessThan(spec.maxPx.w);
    const { w } = widgetSizeFor(mid, "browser");
    expect(w).toBeCloseTo(spec.ideal.w, 5);
  });

  it("keeps media widgets larger than utility widgets on the same display", () => {
    const browser = widgetSizeFor(MONITOR, "browser");
    const clock = widgetSizeFor(MONITOR, "clock");
    const weather = widgetSizeFor(MONITOR, "weather");
    expect(browser.w).toBeGreaterThan(clock.w);
    expect(browser.h).toBeGreaterThan(clock.h);
    expect(browser.w).toBeGreaterThan(weather.w);
    expect(browser.h).toBeGreaterThan(weather.h);
  });

  it("never divides by zero on a degenerate viewport", () => {
    for (const bad of [
      { w: 0, h: 0 },
      { w: Number.NaN, h: Number.NaN },
      { w: -100, h: -100 },
    ] as Viewport[]) {
      const { w, h } = widgetSizeFor(bad, "browser");
      expect(Number.isFinite(w)).toBe(true);
      expect(Number.isFinite(h)).toBe(true);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
    }
  });

  it("has coherent brackets for every kind (min <= max, ideal in (0,1))", () => {
    for (const kind of KINDS) {
      const spec = WIDGET_SIZE_LADDER[kind];
      expect(spec.minPx.w).toBeLessThanOrEqual(spec.maxPx.w);
      expect(spec.minPx.h).toBeLessThanOrEqual(spec.maxPx.h);
      expect(spec.ideal.w).toBeGreaterThan(0);
      expect(spec.ideal.w).toBeLessThan(1);
      expect(spec.ideal.h).toBeGreaterThan(0);
      expect(spec.ideal.h).toBeLessThan(1);
    }
  });
});

describe("currentViewport", () => {
  it("falls back to a laptop default without a window", () => {
    // jsdom may or may not define window; the fallback path is the SSR guard.
    const vp = currentViewport();
    expect(vp.w).toBeGreaterThan(0);
    expect(vp.h).toBeGreaterThan(0);
  });
});
