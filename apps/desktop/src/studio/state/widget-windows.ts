import { useSyncExternalStore } from "react";

import { WIDGET_CATALOG, type WidgetKind } from "../windows/catalog";
import {
  clampToStage,
  nextStackOrder,
  pickSpawnPosition,
} from "../windows/layout";
import { currentViewport, widgetSizeFor } from "../windows/size-ladder";

export interface WidgetWindowInstance {
  id: string;
  kind: WidgetKind;
  props: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  createdAt: number;
}

const STORAGE_KEY = "studio:widget-windows:v1";
const EMPTY: readonly WidgetWindowInstance[] = [];
let windows: readonly WidgetWindowInstance[] = EMPTY;
let hydrated = false;
const subscribers = new Set<() => void>();

const emit = (): void => {
  for (const cb of subscribers) cb();
};

const persist = (): void => {
  if (!hydrated || typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(windows));
};

const write = (next: readonly WidgetWindowInstance[]): void => {
  windows = next;
  persist();
  emit();
};

export function getWidgetWindows(): readonly WidgetWindowInstance[] {
  return windows;
}

export function subscribeWidgetWindows(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function useWidgetWindows(): readonly WidgetWindowInstance[] {
  return useSyncExternalStore(
    subscribeWidgetWindows,
    getWidgetWindows,
    () => EMPTY,
  );
}

export function rehydrateWidgetWindows(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return;
    windows = parsed
      .filter((item): item is WidgetWindowInstance => {
        if (!item || typeof item !== "object") return false;
        const value = item as Partial<WidgetWindowInstance> & {
          stowed?: unknown;
        };
        // Legacy records that were "stowed" no longer have a stowed lane to
        // return to: the drawer is a static preset bank now (#307). Treat any
        // persisted stowed instance as CLOSED so stale widgets don't reappear
        // on stage after upgrade.
        if (value.stowed === true) return false;
        return (
          typeof value.id === "string" &&
          typeof value.kind === "string" &&
          [value.x, value.y, value.w, value.h, value.z, value.createdAt].every(
            Number.isFinite,
          )
        );
      })
      .map((item) => ({
        ...item,
        // Widgets no longer resize, so any persisted free-form w/h from before
        // is stale. Re-derive the fixed per-kind size from the ladder and keep
        // only the saved POSITION. The orb owns its own geometry (OrbWidget
        // re-sizes it every frame), so its persisted size is left untouched.
        ...clampToStage(
          item.kind === "orb"
            ? item
            : { ...item, ...widgetSizeFor(currentViewport(), item.kind) },
        ),
        props: item.props ?? {},
      }));
    emit();
  } catch {
    windows = EMPTY;
  }
}

/** First (any) live instance of a kind, or undefined. Used by the studio-action
 *  router to push focus props onto an already-open singleton before summoning. */
export function findWidgetByKind(
  kind: WidgetKind,
): WidgetWindowInstance | undefined {
  return windows.find((item) => item.kind === kind);
}

export function summonWidget(
  kind: WidgetKind,
  props: Record<string, unknown> = {},
  at?: { x: number; y: number },
  options?: {
    singleton?: boolean;
  },
): string {
  const existing = options?.singleton
    ? windows.find((item) => item.kind === kind)
    : undefined;
  if (existing) {
    focusWidget(existing.id);
    return existing.id;
  }
  // Fixed per-kind size, derived from the live viewport at spawn (the ladder
  // brackets the proportional ideal with px min/max). Widgets don't resize, so
  // this is the widget's size for its whole life bar a window-resize resync.
  const size = widgetSizeFor(currentViewport(), kind);
  const spawn = at ?? pickSpawnPosition(windows, size);
  const rect = clampToStage({ ...spawn, ...size });
  const id = crypto.randomUUID();
  write([
    ...windows,
    {
      id,
      kind,
      props,
      ...rect,
      z: nextStackOrder(windows),
      createdAt: Date.now(),
    },
  ]);
  return id;
}

export function moveWidget(id: string, x: number, y: number): void {
  write(
    windows.map((item) =>
      item.id === id
        ? { ...item, ...clampToStage({ ...item, x, y }) }
        : item,
    ),
  );
}

/**
 * Set a widget's geometry directly. No longer a user affordance (the resize
 * gestures/handle are gone); the ONLY caller now is OrbWidget, which drives the
 * permanent orb's dock/expand geometry from `getOrbTargetGeometry`.
 */
export function resizeWidget(id: string, w: number, h: number): void {
  write(
    windows.map((item) =>
      item.id === id
        ? { ...item, ...clampToStage({ ...item, w, h }) }
        : item,
    ),
  );
}

/**
 * Re-derive every widget's fixed per-kind size from the ladder for the current
 * viewport, keeping each widget's position. Called on window resize so a widget
 * that was adequate on a laptop stays adequate when the window jumps to a
 * monitor (and vice versa). The orb is skipped — OrbWidget owns its geometry.
 * A no-op write is avoided so an idle resize storm doesn't churn subscribers.
 */
export function resyncWidgetSizes(): void {
  const viewport = currentViewport();
  let changed = false;
  const next = windows.map((item) => {
    if (item.kind === "orb") return item;
    const rect = clampToStage({ ...item, ...widgetSizeFor(viewport, item.kind) });
    if (rect.w === item.w && rect.h === item.h && rect.x === item.x && rect.y === item.y) {
      return item;
    }
    changed = true;
    return { ...item, ...rect };
  });
  if (changed) write(next);
}

export function updateWidgetProps(
  id: string,
  props: Record<string, unknown>,
): void {
  write(
    windows.map((item) =>
      item.id === id ? { ...item, props: { ...item.props, ...props } } : item,
    ),
  );
}

export function focusWidget(id: string): void {
  const item = windows.find((candidate) => candidate.id === id);
  if (!item || item.z === nextStackOrder(windows) - 1) return;
  const z = nextStackOrder(windows);
  write(
    windows.map((candidate) =>
      candidate.id === id ? { ...candidate, z } : candidate,
    ),
  );
}

export function closeWidget(id: string): void {
  const next = windows.filter(
    (item) => item.id !== id || WIDGET_CATALOG[item.kind].permanent,
  );
  if (next.length !== windows.length) write(next);
}

export function closeWidgetsByKind(kind: WidgetKind): void {
  if (WIDGET_CATALOG[kind].permanent) return;
  const next = windows.filter((item) => item.kind !== kind);
  if (next.length !== windows.length) write(next);
}

export function closeAll(): void {
  const next = windows.filter((item) => WIDGET_CATALOG[item.kind].permanent);
  if (next.length !== windows.length) write(next);
}

export function __resetWidgetWindows(): void {
  windows = EMPTY;
  hydrated = false;
  subscribers.clear();
}
