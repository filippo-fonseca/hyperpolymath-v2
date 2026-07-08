"use client";

/**
 * widget-transforms — per-widget position/scale overrides for direct 3D
 * manipulation.
 *
 * A framework-light external store (a module singleton read through
 * `useSyncExternalStore`), mirroring `active-widget.ts`. It records the
 * *committed* transform override for each widget after a grab-drag or
 * pinch-pull gesture settles. During a gesture the manipulation controller
 * mutates the tile's outer `THREE.Group` imperatively (the demand-frame
 * doctrine forbids per-frame React re-renders); it commits to this store only
 * once, on `grabEnd`/`pullEnd`. The re-render that commit triggers sets the
 * tile's props to exactly the values already applied imperatively, so it is
 * idempotent by construction.
 *
 * Ownership:
 * - WRITER: `useWidgetManipulation` (in `components/studio/cloud/`) is the
 *   SINGLE writer. Nothing else calls `setWidgetTransform`.
 * - READERS: `WidgetTile` (applies the override to its outer group).
 *
 * A `null` field means "no override — fall back to `layout.ts`" (position) or
 * "natural scale 1" (scale). An entry with both fields null is deleted, so the
 * default read is the shared frozen {@link EMPTY_TRANSFORM}. That shared
 * reference is what keeps `useSyncExternalStore` from looping: an unchanged id
 * always reads back the same object.
 */

import { useSyncExternalStore } from "react";
import { type StudioWidgetId } from "@/components/studio/data/useStudioData";

/** Committed override for one widget. `null` = no override for that channel. */
export interface WidgetTransform {
  /** World-space position override, or `null` to use the layout slot. */
  position: [number, number, number] | null;
  /** Multiplicative scale override on the outer group, or `null` for 1. */
  scale: number | null;
}

/** Scale clamp bounds — feel parameters (see PLAN.md design decision 5). */
export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.75;

/** Clamp a scale into `[SCALE_MIN, SCALE_MAX]`. Pure. */
export function clampScale(scale: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
}

/**
 * The shared default returned for any id without an override. Frozen and
 * referentially stable so `getWidgetTransform` (hence `useSyncExternalStore`)
 * returns an unchanging reference for untouched widgets.
 */
export const EMPTY_TRANSFORM: WidgetTransform = Object.freeze({
  position: null,
  scale: null,
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
 * Commit an override for `id`. A present field overrides that channel (pass
 * `null` to clear it); an absent field is left unchanged. When both channels
 * end up `null` the entry is dropped, so the widget reverts to its layout slot
 * and natural scale. Only notifies subscribers when the value actually changes.
 *
 * SINGLE WRITER: `useWidgetManipulation`. Do not call this from anywhere else.
 */
export function setWidgetTransform(
  id: StudioWidgetId,
  partial: Partial<WidgetTransform>,
): void {
  const prev = transforms.get(id) ?? EMPTY_TRANSFORM;
  const next: WidgetTransform = {
    position: "position" in partial ? partial.position ?? null : prev.position,
    scale: "scale" in partial ? partial.scale ?? null : prev.scale,
  };

  const cleared = next.position === null && next.scale === null;
  const unchanged =
    prev.position === next.position && prev.scale === next.scale;

  if (cleared) {
    if (!transforms.has(id)) return; // already absent → no-op
    transforms.delete(id);
    emit();
    return;
  }

  if (unchanged && transforms.has(id)) return; // identical → no-op
  transforms.set(id, next);
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
