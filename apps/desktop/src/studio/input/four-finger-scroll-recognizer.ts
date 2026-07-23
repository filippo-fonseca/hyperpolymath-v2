/**
 * Four-finger-curl scroll recognizer — the PRIMARY scroll gesture, a pure state
 * machine mirroring `index-scroll-recognizer.ts`.
 *
 * Pose: palm facing the camera, four fingers (index/middle/ring/pinky) curling
 * and uncurling together — like beckoning. Curling the fingers DOWN scrolls the
 * content down; uncurling (opening) scrolls up. It replaces index-finger scroll as
 * the primary because a curl is orthogonal to the point pose that steers the
 * cursor, so scrolling never fights aiming (index-scroll is demoted — gesture-core
 * only feeds it while this one is idle).
 *
 * The driving signal is the whole-hand OPENNESS scalar (mean tip/palm ratio,
 * `computeHandOpenness`) — a fist reads ≈1.0-1.3, an open hand ≈1.7-2.1. This
 * recognizer watches its per-frame VELOCITY: a curl (openness dropping) is a
 * downward scroll, an uncurl (openness rising) is upward. Because openness is
 * palm-normalized it is scale/depth-invariant.
 *
 * Guards, mirroring index-scroll:
 *   1. A velocity DEADBAND (`minVelocity`, openness-units/sec): only a deliberate
 *      curl scrolls; a hand held steady-open drifts nothing.
 *   2. Scroll only engages when a surface is under the reticle (the hub injects the
 *      target and drops a targetless `scrollStart`), so curling over empty space
 *      never scrolls.
 *
 * On the rising edge of `engaged` it anchors the openness and emits a targetless
 * `scrollStart`; each engaged sample past the deadband emits an INCREMENTAL
 * `scrollMove{dy}` (px-ish wheel delta, positive = scroll down); the falling edge
 * emits `scrollEnd`, but only if a `scrollStart` fired. Framework/DOM-free.
 */

import { clamp } from "./clamp";
import type { StudioPhaseInput } from "./types";

export type FourFingerScrollSample = {
  t: number;
  /** Whole-hand openness scalar (mean tip/palm ratio). Falls as fingers curl. */
  openness: number;
  /**
   * True while scroll is a candidate: an open/curling palm (not a point, not
   * pinching) AND a scrollable surface under the reticle. gesture-core computes it.
   */
  engaged: boolean;
};

export type FourFingerScrollConfig = {
  /** Min |openness velocity| (units/sec) for a frame to scroll (deadband). */
  minVelocity: number;
  /** Multiplier turning an openness delta into wheel px. */
  pixelsPerUnit: number;
  /** Clamp on a single frame's emitted |dy| so a landmark pop can't lurch. */
  maxStepPx: number;
};

export const DEFAULT_FOUR_FINGER_SCROLL: FourFingerScrollConfig = {
  minVelocity: 0.9,
  pixelsPerUnit: 900,
  maxStepPx: 90,
};

export type FourFingerScrollRecognizer = {
  push(sample: FourFingerScrollSample): void;
  reset(): void;
};

/**
 * Creates a four-finger-curl scroll recognizer. `onEvent` receives a targetless
 * `scrollStart`, incremental `scrollMove{dy}`, and a terminal `scrollEnd`.
 * `reset()` mid-scroll emits `scrollEnd` first so a hand-lost gap never strands
 * the lifecycle.
 */
export function createFourFingerScrollRecognizer(
  onEvent: (event: StudioPhaseInput) => void,
  config?: Partial<FourFingerScrollConfig>,
): FourFingerScrollRecognizer {
  const cfg: FourFingerScrollConfig = { ...DEFAULT_FOUR_FINGER_SCROLL, ...config };

  let scrolling = false;
  let lastOpenness = 0;
  let lastT = 0;

  function reset(): void {
    if (scrolling) onEvent({ type: "scrollEnd" });
    scrolling = false;
    lastOpenness = 0;
    lastT = 0;
  }

  function push(sample: FourFingerScrollSample): void {
    if (!sample.engaged) {
      reset();
      return;
    }

    if (!scrolling) {
      // Rising edge: anchor the openness and open the lifecycle. No motion on the
      // first frame (no prior sample to diff).
      scrolling = true;
      lastOpenness = sample.openness;
      lastT = sample.t;
      onEvent({ type: "scrollStart" });
      return;
    }

    const dtSec = (sample.t - lastT) / 1000;
    const dOpen = sample.openness - lastOpenness;
    lastOpenness = sample.openness;
    lastT = sample.t;
    if (dtSec <= 0) return;

    // Velocity deadband: a steady palm never scrolls.
    if (Math.abs(dOpen / dtSec) < cfg.minVelocity) return;

    // Openness DROPS as fingers curl → scroll DOWN (positive dy). So negate the
    // delta: curl (dOpen < 0) ⇒ dy > 0, uncurl (dOpen > 0) ⇒ dy < 0 (scroll up).
    const dy = clamp(-dOpen * cfg.pixelsPerUnit, -cfg.maxStepPx, cfg.maxStepPx);
    onEvent({ type: "scrollMove", dy });
  }

  return { push, reset };
}
