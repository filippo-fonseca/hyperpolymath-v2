"use client";

/**
 * active-widget — the shared Wave-2 focus seam.
 *
 * A framework-light external store (a module singleton read through
 * `useSyncExternalStore`), mirroring the input hub's subscription pattern. It
 * records which widget(s) are currently "focused" — i.e. expanded out of the
 * ambient 3D cloud into the crisp DOM overlay.
 *
 * Ownership (reconciled by the Conductor for Wave 2, so the two consumers do
 * not fight over it):
 * - WRITER: the `focus-overlay` unit. Its `<StudioFocusOverlay>` owns the
 *   expand/collapse intent subscription and is the SINGLE writer.
 * - READERS: `widget-cloud` (may dim/hide the focused tile) and, later, the
 *   Wave-3 `split-screen` unit.
 *
 * The API is an ORDERED LIST of ids so Wave-3 split-screen can hold several
 * focused widgets at once without changing the read contract. The MVP writes at
 * most one: `activateWidget` replaces the list, `collapseAll` empties it. A
 * `useActiveWidget()` convenience returns the first id (or null) for the common
 * single-focus consumer.
 */

import { useSyncExternalStore } from "react";
import {
  STUDIO_WIDGET_ORDER,
  type StudioWidgetId,
} from "@/components/studio/data/useStudioData";

const EMPTY: readonly StudioWidgetId[] = [];

let active: readonly StudioWidgetId[] = EMPTY;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

/** Replace the focused set with a single widget (MVP focus semantics). */
export function activateWidget(id: StudioWidgetId): void {
  if (active.length === 1 && active[0] === id) return;
  active = [id];
  emit();
}

/**
 * Page the (single) focused widget to its neighbor in canonical order,
 * wrapping around at the ends. No-op when nothing is focused — paging is only
 * meaningful inside the focus overlay. Delegates to {@link activateWidget}, so
 * it reuses the same replace + no-op + subscriber-notify semantics.
 */
export function pageActiveWidget(dir: "next" | "prev"): void {
  const current = active[0];
  if (current === undefined) return; // nothing focused → no-op
  const i = STUDIO_WIDGET_ORDER.indexOf(current);
  const n = STUDIO_WIDGET_ORDER.length;
  const next = STUDIO_WIDGET_ORDER[(i + (dir === "next" ? 1 : -1) + n) % n]!;
  activateWidget(next);
}

/** Clear all focus — collapse back to the ambient cloud. */
export function collapseAll(): void {
  if (active.length === 0) return;
  active = EMPTY;
  emit();
}

/** Current focused widgets, in order. Referentially stable until it changes. */
export function getActiveWidgets(): readonly StudioWidgetId[] {
  return active;
}

export function subscribeActiveWidgets(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** React hook — re-renders only when the focused set changes. */
export function useActiveWidgets(): readonly StudioWidgetId[] {
  return useSyncExternalStore(
    subscribeActiveWidgets,
    getActiveWidgets,
    () => EMPTY,
  );
}

/** Convenience for single-focus consumers: the first focused id, or null. */
export function useActiveWidget(): StudioWidgetId | null {
  return useActiveWidgets()[0] ?? null;
}

/** Test-only reset of module state. */
export function __resetActiveWidgets(): void {
  active = EMPTY;
  subscribers.clear();
}
