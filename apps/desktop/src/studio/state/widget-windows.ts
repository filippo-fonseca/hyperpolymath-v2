import { useSyncExternalStore } from "react";

import { WIDGET_CATALOG, type WidgetKind } from "../windows/catalog";
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
  stowed: boolean;
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
        stowed: item.stowed === true,
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
    if (existing.stowed) restoreWidget(existing.id, at);
    focusWidget(existing.id);
    return existing.id;
  }
  const size = options?.defaultSize ?? { w: 0.34, h: 0.38 };
  const spawn =
    at ?? pickSpawnPosition(windows.filter((item) => !item.stowed), size);
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
      stowed: false,
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
  if (!item || item.stowed || item.z === nextStackOrder(windows) - 1) return;
  const z = nextStackOrder(windows);
  write(
    windows.map((candidate) =>
      candidate.id === id ? { ...candidate, z } : candidate,
    ),
  );
}

function isPermanentWidget(item: WidgetWindowInstance): boolean {
  const entry = WIDGET_CATALOG[item.kind] as
    | ({ permanent?: boolean } & object)
    | undefined;
  return item.kind === ("orb" as WidgetKind) || entry?.permanent === true;
}

export function stowWidget(id: string): void {
  const item = windows.find((candidate) => candidate.id === id);
  if (!item || item.stowed || isPermanentWidget(item)) return;
  write(
    windows.map((candidate) =>
      candidate.id === id ? { ...candidate, stowed: true } : candidate,
    ),
  );
}

export function restoreWidget(
  id: string,
  position?: { x: number; y: number },
): void {
  const item = windows.find((candidate) => candidate.id === id);
  if (!item || !item.stowed) return;
  const spawn =
    position ??
    pickSpawnPosition(
      windows.filter((candidate) => !candidate.stowed),
      item,
    );
  const rect = clampToStage({ ...item, ...spawn });
  const z = nextStackOrder(windows);
  write(
    windows.map((candidate) =>
      candidate.id === id
        ? { ...candidate, ...rect, z, stowed: false }
        : candidate,
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
