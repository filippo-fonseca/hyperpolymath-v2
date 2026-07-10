"use client";

/**
 * camera — the reset-to-home request seam for The Studio.
 *
 * A framework-light external store (a module singleton read through
 * `useSyncExternalStore`), mirroring {@link ./active-widget} and the input hub's
 * subscription pattern. It is a monotonic REQUEST COUNTER, not a piece of camera
 * state: each `requestCameraHome()` bump is one "send the camera home" edge.
 *
 * Ownership:
 * - WRITERS: any affordance that wants the camera home — the `h`/`Home` keydown
 *   in `<CameraRig>`, and later the Wave-3 focus-autocenter unit (U5).
 * - READER: `<CameraRig>` subscribes and, on each new bump, calls
 *   `controller.goHome()` + `invalidate()` (the rig's damping animates the return).
 *
 * A counter (rather than a boolean) means repeated resets always register, and
 * the reader never has to clear a flag — it just tracks the last count it saw.
 * Keeping this off the U0 intent bus is deliberate: a new intent type would fork
 * the frozen intent contract, so reset lives in its own tiny store instead.
 */

import { useSyncExternalStore } from "react";

let homeRequests = 0;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

/** Request that the camera return home. Bumps the counter and notifies readers. */
export function requestCameraHome(): void {
  homeRequests += 1;
  emit();
}

/** Monotonic count of home requests since load (or last `__resetCameraState`). */
export function getCameraHomeRequests(): number {
  return homeRequests;
}

export function subscribeCameraHome(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** React hook — re-renders only when a new home request lands. */
export function useCameraHomeRequests(): number {
  return useSyncExternalStore(
    subscribeCameraHome,
    getCameraHomeRequests,
    () => 0,
  );
}

/** Test-only reset of module state. */
export function __resetCameraState(): void {
  homeRequests = 0;
  subscribers.clear();
}
