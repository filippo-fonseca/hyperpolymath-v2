"use client";

import { useSyncExternalStore } from "react";

/**
 * Widget span store for the LifeOS bento (UI-CONTRACT-SD3 §2 dynamic resize).
 *
 * The deck is a 4-column · 2-row UNIT grid (`grid-auto-flow: dense`). Each
 * widget owns a `{w,h}` span in grid cells, each axis clamped to 1–2 (2×2 max,
 * 1×1 min). The default layout fills the grid hole-free — Tasks takes the tall
 * 2×2 left block, the other four ride the right 2×2 as 1×1 cells — so the deck
 * always reads as one sealed screen.
 *
 * Persistence lives at localStorage `lifeos:widget-spans` (a `widgetId → {w,h}`
 * map), mirroring the SSR-safe pattern `lifeos:view` uses: the server and the
 * first client paint both render DEFAULTS (so hydration matches), then `load()`
 * runs in an effect and reconciles to the persisted layout. `getServerSnapshot`
 * therefore also returns defaults — never touch `localStorage` during render.
 *
 * "Within reason" (the sealed one-viewport law): a resize only commits if the
 * full span set still packs into ≤ 2 rows. `clampSpanForFit` walks a desired
 * span down until it fits, so a grow that would push the deck past one screen
 * clamps instead of overflowing.
 */

export type WidgetId =
  | "tasks"
  | "review"
  | "habits"
  | "training"
  | "captures"
  | "insights";

export interface Span {
  w: 1 | 2;
  h: 1 | 2;
}

export type SpanMap = Record<WidgetId, Span>;

export const STORAGE_KEY = "lifeos:widget-spans";

export const GRID_COLS = 4;
export const GRID_MAX_ROWS = 2;

/** Packing order — matches the visual reading order of the deck. */
export const WIDGET_ORDER: readonly WidgetId[] = [
  "tasks",
  "review",
  "habits",
  "training",
  "captures",
  "insights",
];

/**
 * Default footprint. Fills the 4×2 grid exactly (8/8), so the default deck has
 * no holes.
 *
 * Issue #400 rebalanced this. Five widgets fitted as one 2×2 hero plus four 1×1
 * cells; a sixth cannot, because 4 + 5 = 9 exceeds the eight cells the
 * one-viewport law allows. The only hole-free six-widget arrangement is two 2×1
 * tiles plus four 1×1 cells, so Tasks keeps its width but gives up its height
 * and Review takes the other wide slot — it wants width to say "topic · what
 * it is for" on one line, and height buys it nothing.
 *
 * Anyone who preferred the tall Tasks tile can drag it back; the resize clamp
 * will shrink whatever it has to in order to keep the deck sealed.
 */
export const DEFAULT_SPANS: SpanMap = {
  tasks: { w: 2, h: 1 },
  review: { w: 2, h: 1 },
  habits: { w: 1, h: 1 },
  training: { w: 1, h: 1 },
  captures: { w: 1, h: 1 },
  insights: { w: 1, h: 1 },
};

function cloneDefaults(): SpanMap {
  return {
    tasks: { ...DEFAULT_SPANS.tasks },
    review: { ...DEFAULT_SPANS.review },
    habits: { ...DEFAULT_SPANS.habits },
    training: { ...DEFAULT_SPANS.training },
    captures: { ...DEFAULT_SPANS.captures },
    insights: { ...DEFAULT_SPANS.insights },
  };
}

const clampAxis = (n: number): 1 | 2 => (n >= 2 ? 2 : 1);

function isSpan(v: unknown): v is Span {
  return (
    typeof v === "object" &&
    v !== null &&
    "w" in v &&
    "h" in v &&
    typeof (v as Span).w === "number" &&
    typeof (v as Span).h === "number"
  );
}

/**
 * Dense-pack the span set into a `GRID_COLS`-wide grid (unbounded rows) exactly
 * as CSS `grid-auto-flow: dense` would, and report the highest row used. A set
 * "fits" the one-viewport law when `maxRow <= GRID_MAX_ROWS`.
 */
export function packMaxRow(spans: SpanMap): number {
  // occupied[row][col]; grow rows lazily.
  const occupied: boolean[][] = [];
  const ensureRow = (r: number) => {
    while (occupied.length <= r) occupied.push(new Array(GRID_COLS).fill(false));
  };
  const fitsAt = (r: number, c: number, w: number, h: number): boolean => {
    if (c + w > GRID_COLS) return false;
    for (let dr = 0; dr < h; dr++) {
      ensureRow(r + dr);
      for (let dc = 0; dc < w; dc++) {
        if (occupied[r + dr][c + dc]) return false;
      }
    }
    return true;
  };
  const mark = (r: number, c: number, w: number, h: number) => {
    for (let dr = 0; dr < h; dr++) {
      ensureRow(r + dr);
      for (let dc = 0; dc < w; dc++) occupied[r + dr][c + dc] = true;
    }
  };

  let maxRow = 0;
  for (const id of WIDGET_ORDER) {
    const { w, h } = spans[id];
    // Dense: scan every earlier cell, top-to-bottom / left-to-right.
    let placed = false;
    for (let r = 0; !placed; r++) {
      ensureRow(r);
      for (let c = 0; c < GRID_COLS; c++) {
        if (fitsAt(r, c, w, h)) {
          mark(r, c, w, h);
          maxRow = Math.max(maxRow, r + h);
          placed = true;
          break;
        }
      }
    }
  }
  return maxRow; // 1-based count of rows consumed
}

export function spansFit(spans: SpanMap): boolean {
  return packMaxRow(spans) <= GRID_MAX_ROWS;
}

/**
 * Largest `{w,h}` ≤ desired for `id` that keeps the whole deck within one
 * viewport, given the other widgets' current spans. Shrinks height first, then
 * width, then falls back to the current span (a resize can always stay put).
 */
export function clampSpanForFit(id: WidgetId, desired: Span, current: SpanMap): Span {
  const w = clampAxis(desired.w);
  const h = clampAxis(desired.h);
  const candidates: Span[] = [
    { w, h },
    { w, h: 1 },
    { w: 1, h },
    { w: 1, h: 1 },
  ];
  for (const cand of candidates) {
    const trial: SpanMap = { ...current, [id]: cand };
    if (spansFit(trial)) return cand;
  }
  return current[id];
}

// --- Module store (shared across the grid + the header reset verb) ----------

let current: SpanMap = cloneDefaults();
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* localStorage unavailable — keep in-memory only */
  }
}

/** Read persisted spans once, after mount. Idempotent. */
export function loadWidgetSpans() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Record<WidgetId, unknown>>;
    const next = cloneDefaults();
    let changed = false;
    for (const id of WIDGET_ORDER) {
      const v = parsed[id];
      if (isSpan(v)) {
        next[id] = { w: clampAxis(v.w), h: clampAxis(v.h) };
        changed = true;
      }
    }
    // Only adopt a stored layout that still honours the one-viewport law; a
    // stale/oversized payload falls back to defaults rather than overflowing.
    if (changed && spansFit(next)) {
      current = next;
      emit();
    }
  } catch {
    /* corrupt payload — stay on defaults */
  }
}

export function setWidgetSpan(id: WidgetId, desired: Span) {
  const clamped = clampSpanForFit(id, desired, current);
  if (clamped.w === current[id].w && clamped.h === current[id].h) return;
  current = { ...current, [id]: clamped };
  persist();
  emit();
}

export function resetWidgetSpans() {
  current = cloneDefaults();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function hasCustomSpans(): boolean {
  return WIDGET_ORDER.some(
    (id) => current[id].w !== DEFAULT_SPANS[id].w || current[id].h !== DEFAULT_SPANS[id].h,
  );
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => current;
// Server + first client paint both see defaults, so hydration matches; load()
// reconciles afterwards.
const getServerSnapshot = () => current;

/** Reactive read of the whole span map. */
export function useWidgetSpans(): SpanMap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Reactive read of "has the user customised the layout?" (drives Reset). */
export function useHasCustomSpans(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasCustomSpans(),
    () => false,
  );
}
