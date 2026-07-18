/**
 * The widget size-ladder — the single authority for how big a widget spawns.
 *
 * Widgets no longer resize (the open-hand / pinch-handle / mouse-grip resizers
 * were removed): every kind gets ONE adequate size, derived from the live
 * viewport so a laptop, a 4K monitor and a projector each land somewhere sane.
 *
 * The rest of the studio speaks in NORMALIZED geometry — `w`/`h` are fractions
 * of the stage (0..1), rendered as CSS percentages (see `WidgetWindow`). So the
 * ladder's job is: given the viewport in pixels and a widget kind, return the
 * normalized {w,h} the store should hold.
 *
 * Each kind carries a proportional IDEAL (a fraction of the viewport) bracketed
 * by absolute pixel MIN/MAX. The pixel bracket is what keeps proportional sizing
 * honest at the extremes: a browser that is a comfortable half-screen on a 1440px
 * laptop would become an unusable 2000px slab on a 4K panel without the ceiling,
 * and a compact clock scaled purely by fraction would shrink to illegibility on a
 * small display without the floor. We size in pixels, clamp in pixels, then divide
 * back to a fraction:
 *
 *   px   = clamp(ideal * viewportPx, minPx, maxPx)
 *   frac = px / viewportPx
 *
 * `clampToStage` (layout.ts) still applies its global on-stage floor/ceiling on
 * top of this, so a huge min on a tiny viewport can never push a widget off the
 * stage. Pure and framework-free: unit-tested with synthetic viewports.
 */

import type { WidgetKind } from "./catalog";

/** Live viewport (or stage) size in CSS pixels. */
export interface Viewport {
  w: number;
  h: number;
}

/** A per-kind size rung: a proportional ideal bracketed by absolute pixel bounds. */
export interface WidgetSizeSpec {
  /** Target size as a fraction of the viewport, before the pixel bracket. */
  ideal: { w: number; h: number };
  /** Absolute pixel floor so a small laptop still gets a usable widget. */
  minPx: { w: number; h: number };
  /** Absolute pixel ceiling so a big monitor / projector doesn't get an absurd one. */
  maxPx: { w: number; h: number };
}

/**
 * The ladder. Two broad tiers:
 *
 *  - MEDIA surfaces (browser, camera) are substantially larger — they carry
 *    web pages and video, which need room.
 *  - UTILITY surfaces (clock, weather, card) stay compact — a clock that eats
 *    a third of the screen is noise.
 *
 * The orb is permanent and re-sizes itself from `getOrbTargetGeometry`; its rung
 * only seeds the very first frame before `OrbWidget` takes over.
 */
export const WIDGET_SIZE_LADDER: Record<WidgetKind, WidgetSizeSpec> = {
  // Media-friendly: a generous half-screen browser, capped so 4K doesn't balloon.
  browser: {
    ideal: { w: 0.52, h: 0.6 },
    minPx: { w: 640, h: 440 },
    maxPx: { w: 1600, h: 1040 },
  },
  // Content: a tall messaging column.
  whatsapp: {
    ideal: { w: 0.3, h: 0.52 },
    minPx: { w: 360, h: 460 },
    maxPx: { w: 620, h: 900 },
  },
  // Compact utility.
  weather: {
    ideal: { w: 0.24, h: 0.28 },
    minPx: { w: 300, h: 240 },
    maxPx: { w: 460, h: 420 },
  },
  // Content: a readable headline column.
  news: {
    ideal: { w: 0.34, h: 0.5 },
    minPx: { w: 400, h: 440 },
    maxPx: { w: 680, h: 900 },
  },
  // Compact utility: an answer card.
  card: {
    ideal: { w: 0.26, h: 0.24 },
    minPx: { w: 320, h: 220 },
    maxPx: { w: 520, h: 420 },
  },
  // Compact utility: a short clock.
  clock: {
    ideal: { w: 0.22, h: 0.18 },
    minPx: { w: 260, h: 150 },
    maxPx: { w: 420, h: 300 },
  },
  // Media-friendly: a camera preview.
  camera: {
    ideal: { w: 0.28, h: 0.32 },
    minPx: { w: 340, h: 300 },
    maxPx: { w: 560, h: 520 },
  },
  // Content: a tall settings panel.
  settings: {
    ideal: { w: 0.3, h: 0.44 },
    minPx: { w: 360, h: 420 },
    maxPx: { w: 560, h: 780 },
  },
  // Permanent presence; OrbWidget owns its real geometry after the first frame.
  orb: {
    ideal: { w: 0.25, h: 0.4 },
    minPx: { w: 240, h: 360 },
    maxPx: { w: 460, h: 680 },
  },
};

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** A finite, positive viewport dimension, or 1 when the input is unusable. */
const safeDimension = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 1;

/**
 * Normalized {w,h} for a widget kind at a given viewport. Sizes in pixels, clamps
 * to the kind's pixel bracket, then converts back to the stage-fraction the store
 * holds. Degenerate viewports (0, NaN) fall back to 1px so the math never divides
 * by zero — the caller's `clampToStage` floor then takes over.
 */
export function widgetSizeFor(
  viewport: Viewport,
  kind: WidgetKind,
): { w: number; h: number } {
  const spec = WIDGET_SIZE_LADDER[kind];
  const vw = safeDimension(viewport.w);
  const vh = safeDimension(viewport.h);
  const wPx = clamp(spec.ideal.w * vw, spec.minPx.w, spec.maxPx.w);
  const hPx = clamp(spec.ideal.h * vh, spec.minPx.h, spec.maxPx.h);
  return { w: wPx / vw, h: hPx / vh };
}

/**
 * The live browser viewport, or a 1440x900 laptop default when there is no
 * `window` (SSR / the unit env). Callers in the store read this at spawn and on
 * window resize; keeping the fallback here means neither has to guard `window`.
 */
export function currentViewport(): Viewport {
  if (typeof window === "undefined") return { w: 1440, h: 900 };
  return {
    w: window.innerWidth || 1440,
    h: window.innerHeight || 900,
  };
}
