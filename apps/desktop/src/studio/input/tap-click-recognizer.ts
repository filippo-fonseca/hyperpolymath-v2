/**
 * Tap-click recognizer — the PRIMARY hand click, a pure state machine mirroring
 * the other recognizers here (`pinch-bloom`, `index-scroll`, …).
 *
 * A tap is an index-finger JAB toward the camera that springs back: the index
 * tip dips forward (its depth drops below a running baseline) and then returns.
 * gesture-core feeds a single scalar `depth` per frame — the index-tip depth
 * relative to the palm plane (see `computeIndexTipDepth`), where SMALLER = closer
 * to the camera. Because it is palm-relative and palm-normalized, it is scale- and
 * position-invariant: only a *forward poke*, not moving the whole hand nearer,
 * trips it.
 *
 * State machine, per frame while a tappable pose is `engaged` (index pointing):
 *   1. Track a slow baseline of the resting depth (EMA), so a drifting hand
 *      distance never accumulates into a false tap.
 *   2. When depth dips `dipThreshold` BELOW the baseline, arm a pending tap and
 *      freeze the baseline (so the dip itself doesn't drag the baseline down).
 *   3. When depth then RECOVERS back to within `recoverThreshold` of the frozen
 *      baseline, fire `onTap()` once — this is the "push and return" that a click
 *      needs (a sustained forward hold, e.g. during a drag, never returns and so
 *      never clicks).
 *   4. A per-tap refractory (`refractoryMs`) debounces so one jab is one click and
 *      a jittery double-bounce can't double-fire.
 *
 * Emits a targetless `tap` intent (gesture-core → hub, which upgrades it with the
 * hovered target exactly as it does `expand`). Framework/DOM-free; unit-tested
 * with synthetic depth streams. `reset()` clears silently — a tap is a one-shot,
 * not a lifecycle, so a hand-lost gap never fires it.
 */

import type { StudioIntentInput } from "./types";

export type TapClickSample = {
  t: number;
  /**
   * Index-tip depth relative to the palm plane, palm-normalized. SMALLER = the
   * fingertip is closer to the camera (a forward jab). gesture-core computes it
   * via `computeIndexTipDepth`.
   */
  depth: number;
  /**
   * True while a tap is a candidate: the index is pointing (point pose) and NOT
   * pinching. gesture-core pre-computes this so the recognizer stays pose-free.
   */
  engaged: boolean;
};

export type TapClickConfig = {
  /** EMA weight for the resting-depth baseline (0..1); small = slow, stable. */
  baselineAlpha: number;
  /** Depth must dip at least this far BELOW baseline to arm a tap. */
  dipThreshold: number;
  /** After a dip, depth must recover to within this of the frozen baseline to fire. */
  recoverThreshold: number;
  /** Min ms between two fired taps (debounce; also blocks a bounce double-fire). */
  refractoryMs: number;
};

export const DEFAULT_TAP_CLICK: TapClickConfig = {
  baselineAlpha: 0.15,
  dipThreshold: 0.35,
  recoverThreshold: 0.15,
  refractoryMs: 320,
};

export type TapClickRecognizer = {
  push(sample: TapClickSample): void;
  reset(): void;
};

/**
 * Creates a tap-click recognizer. `onTap` fires at most once per forward-jab, on
 * the recovery edge, respecting the refractory window.
 */
export function createTapClickRecognizer(
  onTap: (intent: StudioIntentInput) => void,
  config?: Partial<TapClickConfig>,
): TapClickRecognizer {
  const cfg: TapClickConfig = { ...DEFAULT_TAP_CLICK, ...config };

  let baseline: number | null = null;
  let armed = false; // a dip has happened; watching for the recovery edge
  let armedBaseline = 0; // baseline frozen at dip time
  let lastFireT = -Infinity;

  function reset(): void {
    baseline = null;
    armed = false;
    armedBaseline = 0;
    lastFireT = -Infinity;
  }

  function push(sample: TapClickSample): void {
    if (!sample.engaged) {
      // Leaving the pose abandons any half-formed tap and drops the baseline so a
      // fresh point re-seeds from its own resting depth.
      baseline = null;
      armed = false;
      return;
    }

    const { t, depth } = sample;

    // Seed the baseline on the first engaged frame; no tap can form yet.
    if (baseline === null) {
      baseline = depth;
      armed = false;
      return;
    }

    if (!armed) {
      // Resting: track the baseline slowly, and watch for a forward dip.
      if (depth < baseline - cfg.dipThreshold) {
        armed = true;
        armedBaseline = baseline; // freeze so the dip can't drag the baseline down
      } else {
        baseline = baseline + cfg.baselineAlpha * (depth - baseline);
      }
      return;
    }

    // Armed: a dip happened. Fire on the recovery back toward the frozen baseline.
    if (depth >= armedBaseline - cfg.recoverThreshold) {
      armed = false;
      baseline = armedBaseline; // resume tracking from the pre-dip rest depth
      if (t - lastFireT >= cfg.refractoryMs) {
        lastFireT = t;
        onTap({ type: "tap" });
      }
    }
  }

  return { push, reset };
}
