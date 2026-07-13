/**
 * Pinch-hold recognizer — the grab lifecycle, a pure state machine mirroring
 * `swipe-recognizer.ts`.
 *
 * A pinch held past a short threshold (`holdMs`) is a deliberate grab: on the
 * rising edge the origin time is recorded; once the pinch has been continuously
 * engaged for `holdMs`, it emits a targetless `grabStart` (the hub upgrades it
 * with the widget the reticle was over when the pinch began), then `grabMove`
 * per subsequent engaged sample, and `grabEnd` on release — but only if a
 * `grabStart` actually fired. A release before the threshold emits nothing.
 *
 * The threshold lives here, not in the hub: the hub stays clock-free (which is
 * what keeps it synchronously testable). Downstream this becomes widget drag.
 */

import type { StudioPhaseInput } from "./types";

export type PinchHoldSample = {
  t: number;
  /** Normalized cursor-space x (0..1). */
  nx: number;
  /** Normalized cursor-space y (0..1). */
  ny: number;
  /** True while the pinch is held. */
  engaged: boolean;
};

export type PinchHoldConfig = {
  /** Continuous engagement (ms) before a grab commits. */
  holdMs: number;
};

export const DEFAULT_PINCH_HOLD: PinchHoldConfig = {
  holdMs: 250,
};

export type PinchHoldRecognizer = {
  push(sample: PinchHoldSample): void;
  reset(): void;
};

/**
 * Creates a pinch-hold recognizer. Calling `reset()` mid-grab emits `grabEnd`
 * first so a hand-lost gap never leaves a consumer holding a widget.
 */
export function createPinchHoldRecognizer(
  onEvent: (event: StudioPhaseInput) => void,
  config?: Partial<PinchHoldConfig>,
): PinchHoldRecognizer {
  const cfg: PinchHoldConfig = { ...DEFAULT_PINCH_HOLD, ...config };

  let startTime: number | null = null;
  let grabbing = false;

  function reset(): void {
    if (grabbing) onEvent({ type: "grabEnd" });
    startTime = null;
    grabbing = false;
  }

  function push(sample: PinchHoldSample): void {
    if (!sample.engaged) {
      reset();
      return;
    }

    if (startTime === null) {
      startTime = sample.t;
      return;
    }

    if (!grabbing) {
      if (sample.t - startTime >= cfg.holdMs) {
        grabbing = true;
        onEvent({ type: "grabStart" });
        onEvent({ type: "grabMove", nx: sample.nx, ny: sample.ny });
      }
      return;
    }

    onEvent({ type: "grabMove", nx: sample.nx, ny: sample.ny });
  }

  return { push, reset };
}
