"use client";

/**
 * active-row — which of the amphitheater arc's two rows renders at the FRONT
 * (near) geometry, so the far row can be brought forward and made reachable for
 * drag-and-drop.
 *
 * A framework-light external store (a module singleton read through
 * `useSyncExternalStore`), in the exact mold of `active-widget.ts` /
 * `zone-assignment.ts`. It holds a single `frontRow: 0 | 1`: row 0 is the
 * default front (near) group, row 1 is the far group. `arcZoneSlots` reads this
 * (passed in by the renderer) to decide which row-group maps to the near
 * geometry and which to the far — zone assignments never change, only the
 * geometry each row-group renders at.
 *
 * Ownership:
 * - WRITER: the HUD toggle button (`StudioActiveRowToggle`) is the SINGLE
 *   writer, via `toggleFrontRow`.
 * - READERS: `WidgetCloud` (slot geometry), `ZoneMarkers` (drop-zone outlines),
 *   and `framing.ts` (focus-framing target), all read-only.
 *
 * In-memory only (same persistence level as the zone assignment it complements).
 * The getter returns a primitive so `useSyncExternalStore` never loops.
 * `__resetActiveRow()` restores the initial state for tests. Kept separate from
 * `zone-assignment.ts` deliberately: different writer, different cadence, and the
 * two-channel discipline there is about isolating rare slot changes from frequent
 * DnD flips — folding a third concern in would blur that.
 */

import { useSyncExternalStore } from "react";

export type FrontRow = 0 | 1;

let frontRow: FrontRow = 0;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

/** Which row-group renders at the near (front, DnD-reachable) geometry. */
export function getFrontRow(): FrontRow {
  return frontRow;
}

/** Flip the front row-group (0 ↔ 1). Single writer: the HUD toggle button. */
export function toggleFrontRow(): void {
  frontRow = frontRow === 0 ? 1 : 0;
  emit();
}

export function subscribeFrontRow(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** React hook — re-renders only when the front row flips. */
export function useFrontRow(): FrontRow {
  return useSyncExternalStore(subscribeFrontRow, getFrontRow, () => 0);
}

/** Test-only reset of module state. */
export function __resetActiveRow(): void {
  frontRow = 0;
  subscribers.clear();
}
