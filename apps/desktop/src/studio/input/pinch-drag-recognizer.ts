/**
 * Pinch-drag recognizer — a pure state machine mirroring `swipe-recognizer.ts`.
 *
 * While a pinch is engaged it emits a continuous drag vector: on the rising edge
 * it anchors an origin and emits `dragStart`; each subsequent engaged sample
 * emits `dragMove` with the CUMULATIVE delta from that origin (`dx`, `dy` in
 * normalized cursor space, `dz` a depth proxy — the palm-size dolly scalar the
 * caller computes in gesture-core via `pinch-dolly.ts`); the falling edge emits
 * `dragEnd`. Depth is pre-computed by the caller and handed in as `depth`; the
 * recognizer only diffs the scalar it's given.
 *
 * Downstream (a later wave) turns this into grab-the-world camera pan/dolly.
 * DOM-free and framework-free so it is unit-testable with synthetic samples.
 */

import type { StudioPhaseInput } from "./types";

export type PinchDragSample = {
  t: number;
  /** Normalized cursor-space x (0..1), already mirrored/inset by the caller. */
  nx: number;
  /** Normalized cursor-space y (0..1). */
  ny: number;
  /** A depth proxy (the palm-size dolly scalar). Diffed against the origin. */
  depth: number;
  /** True while the pinch is held. */
  engaged: boolean;
};

export type PinchDragRecognizer = {
  push(sample: PinchDragSample): void;
  reset(): void;
};

/**
 * Creates a pinch-drag recognizer. `onEvent` receives `dragStart`, a stream of
 * cumulative `dragMove`s, and a terminal `dragEnd`. Calling `reset()` mid-gesture
 * emits `dragEnd` first so a hand-lost gap never leaves a consumer mid-drag.
 */
export function createPinchDragRecognizer(
  onEvent: (event: StudioPhaseInput) => void,
): PinchDragRecognizer {
  let origin: { nx: number; ny: number; depth: number } | null = null;

  function reset(): void {
    if (origin !== null) {
      origin = null;
      onEvent({ type: "dragEnd" });
    }
  }

  function push(sample: PinchDragSample): void {
    if (!sample.engaged) {
      reset();
      return;
    }

    if (origin === null) {
      origin = { nx: sample.nx, ny: sample.ny, depth: sample.depth };
      onEvent({ type: "dragStart" });
      onEvent({ type: "dragMove", dx: 0, dy: 0, dz: 0 });
      return;
    }

    onEvent({
      type: "dragMove",
      dx: sample.nx - origin.nx,
      dy: sample.ny - origin.ny,
      dz: sample.depth - origin.depth,
    });
  }

  return { push, reset };
}
