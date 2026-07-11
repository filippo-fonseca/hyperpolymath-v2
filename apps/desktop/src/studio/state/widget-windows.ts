import { useSyncExternalStore } from "react";

import type { WidgetKind } from "../windows/catalog";
import {
  clampToStage,
  nextStackOrder,
  pickSpawnPosition,
} from "../windows/layout";

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
        const value = item as Partial<WidgetWindowInstance>;
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
        ...clampToStage(item),
        props: item.props ?? {},
      }));
    emit();
  } catch {
    windows = EMPTY;
  }
}

export function summonWidget(
  kind: WidgetKind,
  props: Record<string, unknown> = {},
  at?: { x: number; y: number },
  options?: {
    defaultSize?: { w: number; h: number };
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
  const size = options?.defaultSize ?? { w: 0.34, h: 0.38 };
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

export function resizeWidget(id: string, w: number, h: number): void {
  write(
    windows.map((item) =>
      item.id === id
        ? { ...item, ...clampToStage({ ...item, w, h }) }
        : item,
    ),
  );
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
  const next = windows.filter((item) => item.id !== id);
  if (next.length !== windows.length) write(next);
}

export function closeWidgetsByKind(kind: WidgetKind): void {
  const next = windows.filter((item) => item.kind !== kind);
  if (next.length !== windows.length) write(next);
}

export function closeAll(): void {
  if (windows.length > 0) write(EMPTY);
}

export function __resetWidgetWindows(): void {
  windows = EMPTY;
  hydrated = false;
  subscribers.clear();
}
