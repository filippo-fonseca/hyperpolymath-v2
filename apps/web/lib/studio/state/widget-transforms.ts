"use client";

/**
 * widget-transforms — per-widget position overrides for direct 3D manipulation.
 *
 * A framework-light external store (a module singleton read through
 * `useSyncExternalStore`), mirroring `active-widget.ts`. It records the
 * *committed* position override for each widget after a grab-drag gesture
 * settles. During a gesture the manipulation controller mutates the tile's
 * outer `THREE.Group` imperatively (the demand-frame doctrine forbids per-frame
 * React re-renders); it commits to this store only once, on `grabEnd`. The
 * re-render that commit triggers sets the tile's props to exactly the values
 * already applied imperatively, so it is idempotent by construction.
 *
 * Widgets render at ONE fixed uniform size — there is no scale channel. Grab
 * moves a card; it never resizes it.
 *
 * Ownership:
 * - WRITER: `useWidgetManipulation` (in `components/studio/cloud/`) is the
 *   SINGLE writer. Nothing else calls `setWidgetTransform`.
 * - READERS: `WidgetTile` (applies the override to its outer group).
 *
 * A `null` position means "no override — fall back to `layout.ts`". A null
 * entry is deleted, so the default read is the shared frozen
 * {@link EMPTY_TRANSFORM}. That shared reference is what keeps
 * `useSyncExternalStore` from looping: an unchanged id always reads back the
 * same object.
 */

import { useSyncExternalStore } from "react";
import { type StudioWidgetId } from "@/components/studio/data/useStudioData";

/** Committed override for one widget. `null` = no override (use layout slot). */
export interface WidgetTransform {
  /** World-space position override, or `null` to use the layout slot. */
  position: [number, number, number] | null;
}

/**
 * The shared default returned for any id without an override. Frozen and
 * referentially stable so `getWidgetTransform` (hence `useSyncExternalStore`)
 * returns an unchanging reference for untouched widgets.
 */
export const EMPTY_TRANSFORM: WidgetTransform = Object.freeze({
  position: null,
});

const transforms = new Map<StudioWidgetId, WidgetTransform>();
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

/**
 * Current committed override for `id`, or the shared {@link EMPTY_TRANSFORM}
 * when none exists. The returned object is referentially stable until the id's
 * override actually changes.
 */
export function getWidgetTransform(id: StudioWidgetId): WidgetTransform {
  return transforms.get(id) ?? EMPTY_TRANSFORM;
}

/**
 * Commit a position override for `id`. Pass `null` to clear it, which drops the
 * entry so the widget reverts to its layout slot. Only notifies subscribers
 * when the value actually changes.
 *
 * SINGLE WRITER: `useWidgetManipulation`. Do not call this from anywhere else.
 */
export function setWidgetTransform(
  id: StudioWidgetId,
  position: [number, number, number] | null,
): void {
  const prev = transforms.get(id) ?? EMPTY_TRANSFORM;

  if (position === null) {
    if (!transforms.has(id)) return; // already absent → no-op
    transforms.delete(id);
    emit();
    return;
  }

  if (prev.position === position && transforms.has(id)) return; // identical ref → no-op
  transforms.set(id, { position });
  emit();
}

export function subscribeWidgetTransforms(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * React hook — re-renders only when THIS id's override changes. Backed by the
 * map entry (or the shared frozen default), so its snapshot reference is stable
 * across unrelated widgets' updates.
 */
export function useWidgetTransform(id: StudioWidgetId): WidgetTransform {
  return useSyncExternalStore(
    subscribeWidgetTransforms,
    () => getWidgetTransform(id),
    () => EMPTY_TRANSFORM,
  );
}

/** Test-only reset of module state. */
export function __resetWidgetTransforms(): void {
  transforms.clear();
  subscribers.clear();
}
