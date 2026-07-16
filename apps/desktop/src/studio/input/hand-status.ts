/**
 * Hand-tracking store — the tiny external store the reticle and the HUD toggle
 * read. It carries two slices: whether hand tracking is toggled `enabled`, and
 * the live {@link HandDriverStatus} the driver reports as it loads the model,
 * asks for camera permission, and runs.
 *
 * Framework-light (one `useSyncExternalStore` hook) so cursor-rate status changes
 * only re-render the affordances that read them, never the widget tree.
 */

import { useSyncExternalStore } from "react";

import type { HandDriverStatus } from "./drivers/hand";

export type HandTrackingState = {
  /** True while the user has hand tracking toggled on. */
  enabled: boolean;
  /** The driver's live lifecycle status (idle when off). */
  status: HandDriverStatus;
};

let state: HandTrackingState = { enabled: false, status: { state: "idle" } };

const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

export function getHandTrackingState(): HandTrackingState {
  return state;
}

export function subscribeHandTracking(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Sets the toggle slice. No-op (and no emit) when unchanged. */
export function setHandEnabled(enabled: boolean): void {
  if (state.enabled === enabled) return;
  state = { ...state, enabled };
  emit();
}

/** Records the latest driver status. Always emits (status objects are fresh). */
export function setHandStatus(status: HandDriverStatus): void {
  state = { ...state, status };
  emit();
}

export function useHandTracking(): HandTrackingState {
  return useSyncExternalStore(subscribeHandTracking, getHandTrackingState, getHandTrackingState);
}

export function useHandStatus(): HandDriverStatus {
  return useHandTracking().status;
}
