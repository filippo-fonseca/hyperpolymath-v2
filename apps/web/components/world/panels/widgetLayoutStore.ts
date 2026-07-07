"use client";

/**
 * widgetLayoutStore.ts — W-04 · The Bottega (Phase 3) · layout-persistence
 *
 * The store the bench remembers itself with (PLAN §3.6). It holds the arc
 * ORDER (index 0 = leftmost slot) and the HIDDEN roster, persists them, and
 * exposes both an imperative surface (`loadWidgetLayout`/`saveWidgetLayout`)
 * and a reactive one (`useWidgetLayout` over a module singleton) — the exact
 * `useFocusStack` discipline: mutations create a NEW array identity, and the
 * snapshot getter returns a STABLE reference when nothing changed, so
 * `useSyncExternalStore` never loops.
 *
 * Gate Q1 = localStorage (Filippo's ratified default): zero migration, instant,
 * this-device-only. The schema is deliberately shaped so a `users.world_layout`
 * JSONB column is a drop-in upgrade later — `loadWidgetLayout` would become a
 * provider-seeded read and `saveWidgetLayout` a debounced server action, and
 * ONLY this file would change. The `v` discriminant lets a future `V2`
 * (`angles?: Record<WidgetId, number>`, §12) be added without a hard break:
 * unknown/foreign blobs are salvaged best-effort, never crash the world.
 *
 * SSR-safe: with no `window` (server render / RSC import), every read returns
 * `DEFAULT_LAYOUT` and every write is a no-op. `WidgetId` is imported from the
 * Conductor-frozen `widgetTypes.ts` — never re-declared here.
 */

import { useSyncExternalStore } from "react";
import type { WidgetId } from "./widgetTypes";

/** localStorage slot; the `@1` mirrors the schema version for easy hand-migration. */
export const WIDGET_LAYOUT_STORAGE_KEY = "world:widgetLayout@1";

/**
 * The persisted bench layout. `v` is the schema discriminant (bump on a
 * breaking shape change; add optional fields for additive ones).
 */
export interface WidgetLayoutV1 {
  v: 1;
  /** arc order, index 0 = leftmost slot */
  order: WidgetId[];
  /** dismissed from the bench (summonable via key/Jarvis later) */
  hidden: WidgetId[];
}

/**
 * The canonical roster in DEFAULT order. Doubles as (a) the set of VALID ids
 * for validation and (b) the append order for missing ids. This is a runtime
 * value list, NOT a re-declaration of the `WidgetId` type — kept in sync with
 * `widgetTypes.ts` by the shared import above (a stray/removed id would fail
 * the `WidgetId[]` annotation at compile time).
 */
const ROSTER: readonly WidgetId[] = [
  "tasks",
  "captures",
  "agenda",
  "habits",
  "journal",
];

const VALID_IDS: ReadonlySet<WidgetId> = new Set(ROSTER);

/** The pristine layout — full roster, nothing hidden. Frozen; callers get clones. */
export const DEFAULT_LAYOUT: WidgetLayoutV1 = Object.freeze({
  v: 1,
  order: Object.freeze([...ROSTER]) as unknown as WidgetId[],
  hidden: Object.freeze([]) as unknown as WidgetId[],
}) as WidgetLayoutV1;

/** A fresh, mutable copy of the default (never hands out the frozen singleton). */
function cloneDefault(): WidgetLayoutV1 {
  return { v: 1, order: [...ROSTER], hidden: [] };
}

/**
 * Coerce an arbitrary value into a clean `WidgetId[]`: keep only known ids, in
 * first-seen order, de-duplicated. Unknown ids (from a future version) are
 * dropped silently.
 */
function coerceIds(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<WidgetId>();
  const out: WidgetId[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item as WidgetId;
    if (VALID_IDS.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Normalize any parsed blob into a valid `WidgetLayoutV1`. Total and forgiving:
 * unknown ids dropped, missing ids appended in DEFAULT order, `hidden` never
 * overlaps `order`, and any `v` (incl. a future `v:2` with extra fields) is
 * salvaged best-effort down to the V1 shape. The result is always coherent —
 * this is what keeps a corrupt/foreign blob from crashing the world.
 */
function normalizeLayout(raw: unknown): WidgetLayoutV1 {
  if (raw === null || typeof raw !== "object") return cloneDefault();

  const candidate = raw as { order?: unknown; hidden?: unknown };
  const order = coerceIds(candidate.order);
  const orderSet = new Set(order);

  // hidden = valid ids not already placed on the bench
  const hidden = coerceIds(candidate.hidden).filter((id) => !orderSet.has(id));
  const hiddenSet = new Set(hidden);

  // append any roster ids that are neither ordered nor hidden, in DEFAULT order
  for (const id of ROSTER) {
    if (!orderSet.has(id) && !hiddenSet.has(id)) {
      order.push(id);
      orderSet.add(id);
    }
  }

  return { v: 1, order, hidden };
}

/** True array-equality on two `WidgetId[]` (order-sensitive). */
function sameOrder(a: WidgetId[], b: WidgetId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Read + validate the persisted layout. SSR-safe (no `window` → DEFAULT), and
 * defensive against corruption: malformed JSON or a throwing/absent localStorage
 * both fall back to a fresh `DEFAULT_LAYOUT`.
 */
export function loadWidgetLayout(): WidgetLayoutV1 {
  if (typeof window === "undefined") return cloneDefault();
  try {
    const raw = window.localStorage.getItem(WIDGET_LAYOUT_STORAGE_KEY);
    if (raw === null) return cloneDefault();
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return cloneDefault();
  }
}

/** Persist a layout. SSR-safe and swallows quota/security errors (never throws). */
export function saveWidgetLayout(layout: WidgetLayoutV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WIDGET_LAYOUT_STORAGE_KEY,
      JSON.stringify(layout),
    );
  } catch {
    // localStorage unavailable / full / blocked — layout stays in memory.
  }
}

// ── Module-level store (the `focusStack` singleton pattern) ──────────────────
// Lazily seeded from storage on first read so a server-side module import never
// touches `window`. Mutations always replace `current` with a NEW object and a
// NEW `order` array identity; when nothing changes, `current` is untouched so
// the snapshot reference is stable.
let current: WidgetLayoutV1 | null = null;
const subs = new Set<() => void>();

function getSnapshot(): WidgetLayoutV1 {
  if (current === null) current = loadWidgetLayout();
  return current;
}

/** SSR/hydration snapshot — the stable frozen default (never reads storage). */
function getServerSnapshot(): WidgetLayoutV1 {
  return DEFAULT_LAYOUT;
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

function notify(): void {
  for (const fn of Array.from(subs)) fn();
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/**
 * Reorder a widget within the arc, then persist + notify. `toIndex` is clamped
 * to `[0, order.length - 1]`. No-ops (id not on the bench, or a move that leaves
 * the order byte-identical) skip the write and the notify entirely — the
 * stable-snapshot discipline that stops `useSyncExternalStore` from looping.
 */
function moveWidget(id: WidgetId, toIndex: number): void {
  const layout = getSnapshot();
  const from = layout.order.indexOf(id);
  if (from === -1) return; // not on the bench (hidden / unknown) — nothing to move

  const target = clamp(Math.trunc(toIndex), 0, layout.order.length - 1);

  const nextOrder = [...layout.order];
  nextOrder.splice(from, 1);
  nextOrder.splice(target, 0, id);

  if (sameOrder(nextOrder, layout.order)) return; // no change → no churn

  current = { v: 1, order: nextOrder, hidden: [...layout.hidden] };
  saveWidgetLayout(current);
  notify();
}

/**
 * Reactive consumer for the rig. Mirrors `useFocusStack`: `useSyncExternalStore`
 * over the module singleton with a stable client snapshot and a server snapshot.
 * `moveWidget` is a stable module reference (safe as a dep / handler prop).
 */
export function useWidgetLayout(): {
  layout: WidgetLayoutV1;
  moveWidget(id: WidgetId, toIndex: number): void;
} {
  const layout = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { layout, moveWidget };
}

/**
 * Test-only reset of the in-memory singleton (re-seeds from storage on next
 * read). Not part of the runtime surface; the rig never calls it.
 */
export function __resetWidgetLayoutStoreForTests(): void {
  current = null;
  subs.clear();
}
