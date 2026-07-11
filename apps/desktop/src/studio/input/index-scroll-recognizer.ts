/**
 * Index-scroll recognizer — the "scroll a surface with your fingertip" primitive,
 * a pure state machine mirroring `pinch-hold-recognizer.ts`.
 *
 * Pose: index extended, other fingers curled (gesture-core's "point" pose). While
 * that pose is held over a scrollable surface, vertical index-tip motion becomes
 * scroll: moving the fingertip DOWN scrolls the content down, UP scrolls up.
 *
 * The point pose already steers the cursor, so an unqualified "any vertical
 * motion scrolls" would fight cursor aiming. Two guards keep the two apart:
 *   1. A per-frame VELOCITY DEADBAND (`minVelocity`, normalized-units/sec): only
 *      motion faster than a deliberate flick scrolls; a slow, aiming point drifts
 *      the cursor without scrolling.
 *   2. Scroll only engages when a surface is under the reticle (the hub injects
 *      the target and drops a targetless `scrollStart`), so pointing at empty
 *      space never scrolls.
 *
 * On the rising edge of `engaged` it anchors the fingertip ny and emits a
 * targetless `scrollStart`; each subsequent engaged sample past the deadband
 * emits an INCREMENTAL `scrollMove{dy}` (px-ish wheel delta, positive = scroll
 * down); the falling edge emits `scrollEnd`, but only if a `scrollStart` fired.
 * Incremental (not cumulative) deltas map straight onto a WheelEvent / a
 * `scrollBy` per frame. Framework/DOM-free; unit-tested with synthetic streams.
 */

import type { StudioPhaseInput } from "./types";

export type IndexScrollSample = {
  t: number;
  /** Index-fingertip ny in cursor space (0..1); larger = lower on screen. */
  ny: number;
  /**
   * True while scroll is a candidate: point pose AND not pinching AND a
   * scrollable surface under the reticle. gesture-core pre-computes this.
   */
  engaged: boolean;
};

export type IndexScrollConfig = {
  /** Min |velocity| (ny-units/sec) for a frame to scroll (aiming deadband). */
  minVelocity: number;
  /** Multiplier turning ny delta (0..1 units) into wheel px. */
  pixelsPerUnit: number;
  /** Clamp on a single frame's emitted |dy| so a landmark pop can't lurch. */
  maxStepPx: number;
};

export const DEFAULT_INDEX_SCROLL: IndexScrollConfig = {
  minVelocity: 0.35,
  pixelsPerUnit: 1400,
  maxStepPx: 90,
};

export type IndexScrollRecognizer = {
  push(sample: IndexScrollSample): void;
  reset(): void;
};

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Creates an index-scroll recognizer. `onEvent` receives a targetless
 * `scrollStart`, a stream of incremental `scrollMove{dy}`, and a terminal
 * `scrollEnd`. `reset()` mid-scroll emits `scrollEnd` first so a hand-lost gap
 * never strands the lifecycle.
 */
export function createIndexScrollRecognizer(
  onEvent: (event: StudioPhaseInput) => void,
  config?: Partial<IndexScrollConfig>,
): IndexScrollRecognizer {
  const cfg: IndexScrollConfig = { ...DEFAULT_INDEX_SCROLL, ...config };

  let scrolling = false;
  let lastNy = 0;
  let lastT = 0;

  function reset(): void {
    if (scrolling) onEvent({ type: "scrollEnd" });
    scrolling = false;
    lastNy = 0;
    lastT = 0;
  }

  function push(sample: IndexScrollSample): void {
    if (!sample.engaged) {
      reset();
      return;
    }

    if (!scrolling) {
      // Rising edge: anchor the fingertip and open the lifecycle. No motion is
      // scrolled on the very first frame (no prior sample to diff).
      scrolling = true;
      lastNy = sample.ny;
      lastT = sample.t;
      onEvent({ type: "scrollStart" });
      return;
    }

    const dtSec = (sample.t - lastT) / 1000;
    const dNy = sample.ny - lastNy;
    lastNy = sample.ny;
    lastT = sample.t;
    if (dtSec <= 0) return;

    // Velocity deadband: a slow, aiming point never scrolls.
    if (Math.abs(dNy / dtSec) < cfg.minVelocity) return;

    const dy = clamp(dNy * cfg.pixelsPerUnit, -cfg.maxStepPx, cfg.maxStepPx);
    onEvent({ type: "scrollMove", dy });
  }

  return { push, reset };
}
