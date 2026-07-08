"use client";

/**
 * hand-status — the shared Wave-3 "is hand mode running" seam.
 *
 * A framework-light external store (a module singleton read through
 * `useSyncExternalStore`), mirroring `active-widget.ts` exactly. It surfaces the
 * live {@link HandDriverStatus} outside the single `useHandControl` hook instance
 * so overlay chrome can react to hand-mode state.
 *
 * Why this exists: hand-driver status is otherwise private `useState` inside
 * `useHandControl` (its only consumer). The reticle needs a faithful "hand mode
 * is on" signal — `cursor.active` alone can't distinguish hand from mouse (the
 * mouse driver flips it true on stage entry). This is the smallest seam: a
 * module singleton published from the one place every status transition flows.
 *
 * Ownership (reconciled by the Conductor for Wave 3):
 * - WRITER: `useHandControl` ONLY — it publishes at its status funnel points
 *   (the driver's `onStatusChange`, `disable()` — reached by both the pill's
 *   "Turn off" and the open-palm halt intent — and mount-effect teardown).
 * - READERS: `StudioHandReticle` (visibility gate), and future HUD chrome.
 *
 * The type import from `drivers/hand` is type-only (erased at compile time), so
 * no MediaPipe/webcam code is pulled in; the driver's heavy deps are behind
 * dynamic `import()` regardless.
 */

import { useSyncExternalStore } from "react";
import type { HandDriverStatus } from "@/lib/studio/input/drivers/hand";

let status: HandDriverStatus | null = null;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

/**
 * Publish the latest hand-driver status (or `null` when disabled/torn down).
 * Identity-guarded like `activateWidget`: an unchanged reference skips the emit,
 * so re-publishing the same object never triggers a wasted re-render.
 */
export function publishHandStatus(next: HandDriverStatus | null): void {
  if (next === status) return;
  status = next;
  emit();
}

export function getHandStatus(): HandDriverStatus | null {
  return status;
}

export function subscribeHandStatus(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** React hook — re-renders only when the hand status reference changes. */
export function useHandStatus(): HandDriverStatus | null {
  return useSyncExternalStore(
    subscribeHandStatus,
    getHandStatus,
    () => null,
  );
}

/** Test-only reset of module state. */
export function __resetHandStatus(): void {
  status = null;
  subscribers.clear();
}
