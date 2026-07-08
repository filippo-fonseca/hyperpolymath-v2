"use client";

/**
 * zone-assignment — which widget sits in which amphitheater zone, plus the
 * transient drag-and-drop state that drives zone highlights.
 *
 * A framework-light external store (module singletons read through
 * `useSyncExternalStore`), in the exact mold of `active-widget.ts`. It replaces
 * `widget-transforms.ts`: widgets no longer carry free-form position overrides;
 * each occupies one of the fixed zone slots from `layout.ts`, and a drag drops a
 * card into a zone, reflowing the rest.
 *
 * Two independent channels so a drag's frequent highlight flips never wake the
 * (rarely-changing) slot readers:
 *  - ASSIGNMENT — `StudioWidgetId[]` indexed by zone, seeded from
 *    `STUDIO_WIDGET_ORDER`. Changes once per drop. Readers: WidgetCloud/WidgetTile
 *    (slot targets) and framing.ts (focus targets).
 *  - DND — `{ grabbedId, nearestZone }`, updated a handful of times per drag as the
 *    nearest zone flips. Readers: ZoneMarkers (which zone to highlight).
 *
 * Ownership:
 * - WRITER: the manipulation controller (`useWidgetManipulation`) is the SINGLE
 *   writer of both channels — `setDndState` during a drag, `moveWidgetToZone` on
 *   drop.
 * - READERS: as above; all read-only.
 *
 * In-memory only (same persistence level as the transforms it replaces). Both
 * getters return referentially-stable snapshots so `useSyncExternalStore` never
 * loops. `__resetZoneAssignment()` restores the initial state for tests.
 */

import { useSyncExternalStore } from "react";
import {
  STUDIO_WIDGET_ORDER,
  type StudioWidgetId,
} from "@/components/studio/data/useStudioData";

/** The canonical starting assignment: widget `i` in zone `i`. Stable reference. */
const INITIAL_ASSIGNMENT: readonly StudioWidgetId[] = [...STUDIO_WIDGET_ORDER];

/** Transient drag state. `grabbedId` null ⇒ no drag in progress. */
export interface StudioDndState {
  /** The widget currently held, or `null` when idle. */
  grabbedId: StudioWidgetId | null;
  /** Zone index the held card would drop into right now, or `null` when idle. */
  nearestZone: number | null;
}

/** Shared frozen idle state — the stable reference returned while no drag runs. */
const IDLE_DND: StudioDndState = Object.freeze({ grabbedId: null, nearestZone: null });

let assignment: readonly StudioWidgetId[] = INITIAL_ASSIGNMENT;
let dnd: StudioDndState = IDLE_DND;

const assignmentSubs = new Set<() => void>();
const dndSubs = new Set<() => void>();

function emitAssignment(): void {
  for (const cb of assignmentSubs) cb();
}
function emitDnd(): void {
  for (const cb of dndSubs) cb();
}

/**
 * Pure insert-and-shift reflow: move `id` to `zoneIdx`, splicing it out of its
 * current slot and back in at the target so every card between shifts by one
 * (the least-surprising list-DnD rule). `zoneIdx` is clamped to a valid slot and
 * interpreted as the FINAL resting index. Returns the SAME reference unchanged
 * when the id is unknown or already in that zone, so callers can gate emits on
 * identity.
 */
export function reflowAssignment(
  assignment: readonly StudioWidgetId[],
  id: StudioWidgetId,
  zoneIdx: number,
): readonly StudioWidgetId[] {
  const from = assignment.indexOf(id);
  if (from === -1) return assignment; // unknown id → unchanged
  const to = Math.max(0, Math.min(zoneIdx, assignment.length - 1));
  if (from === to) return assignment; // already there → no move
  const next = assignment.slice();
  next.splice(from, 1); // remove from its current zone
  next.splice(to, 0, id); // reinsert at the target; everything between shifts
  return next;
}

/**
 * Move `id` into `zoneIdx`, reflowing the rest. Single writer: the manipulation
 * controller, on drop. Only notifies when the assignment actually changes.
 */
export function moveWidgetToZone(id: StudioWidgetId, zoneIdx: number): void {
  const next = reflowAssignment(assignment, id, zoneIdx);
  if (next === assignment) return; // no-op (unknown id or same zone)
  assignment = next;
  emitAssignment();
}

/**
 * Update the transient drag state. Change-gated: identical `{grabbedId,
 * nearestZone}` is a no-op, so a still hand over one zone emits nothing. Passing
 * `(null, null)` collapses back to the shared idle reference.
 */
export function setDndState(
  grabbedId: StudioWidgetId | null,
  nearestZone: number | null,
): void {
  if (dnd.grabbedId === grabbedId && dnd.nearestZone === nearestZone) return;
  dnd =
    grabbedId === null && nearestZone === null ? IDLE_DND : { grabbedId, nearestZone };
  emitDnd();
}

/** Current zone assignment (zone index → widget id). Referentially stable. */
export function getZoneAssignment(): readonly StudioWidgetId[] {
  return assignment;
}

/** Current transient drag state. Referentially stable until it changes. */
export function getDndState(): StudioDndState {
  return dnd;
}

export function subscribeZoneAssignment(cb: () => void): () => void {
  assignmentSubs.add(cb);
  return () => {
    assignmentSubs.delete(cb);
  };
}

export function subscribeDndState(cb: () => void): () => void {
  dndSubs.add(cb);
  return () => {
    dndSubs.delete(cb);
  };
}

/** React hook — re-renders only when the zone assignment changes. */
export function useZoneAssignment(): readonly StudioWidgetId[] {
  return useSyncExternalStore(
    subscribeZoneAssignment,
    getZoneAssignment,
    () => INITIAL_ASSIGNMENT,
  );
}

/** React hook — re-renders only when the transient drag state changes. */
export function useDndState(): StudioDndState {
  return useSyncExternalStore(subscribeDndState, getDndState, () => IDLE_DND);
}

/** Test-only reset of module state. */
export function __resetZoneAssignment(): void {
  assignment = INITIAL_ASSIGNMENT;
  dnd = IDLE_DND;
  assignmentSubs.clear();
  dndSubs.clear();
}
