/**
 * Open-hand resize recognizer — the "grow / shrink a widget" primitive, a pure
 * state machine mirroring `pinch-hold-recognizer.ts`.
 *
 * The whole-hand openness scalar (mean of the four tip/palm ratios, computed in
 * gesture-core) drives it. Unlike pinch (a discrete latch), resize is a
 * continuous, delta-from-baseline gesture built to be twitch-proof:
 *
 *   1. ARM — the hand must be a resize candidate (open pose, NOT pinching, and a
 *      widget under the reticle) continuously for `armMs`. This dwell is the main
 *      anti-twitch guard: a hand that flashes open for a frame (e.g. releasing a
 *      grab) never arms. On arming it captures the openness BASELINE and emits a
 *      targetless `resizeStart` (the hub injects the hovered widget).
 *   2. APPLY — each subsequent engaged sample emits `resizeMove{scale}`, where
 *      `scale` is a multiplier about 1.0 derived from `openness - baseline`:
 *        - a DEADBAND (`deadband`) around the baseline emits scale 1.0, so a hand
 *          held steady never drifts the widget;
 *        - beyond the deadband, `scale = 1 + gain * (|delta| - deadband) * sign`,
 *          clamped to `[minScale, maxScale]` so a single gesture can't fling the
 *          widget past a sane range (the store's clampToStage floors it at 0.16);
 *        - HYSTERESIS + RATE LIMITING: the emitted scale only moves toward its
 *          target by at most `maxScaleStepPerMs * dt` per frame, and tiny changes
 *          below `emitEpsilon` are skipped, so the applied size eases rather than
 *          jitters at the frame rate.
 *   3. DISARM — a falling edge (pose left open / pinch engaged / hover lost /
 *      hand lost via `reset()`) emits `resizeEnd`, but only if a `resizeStart`
 *      actually fired. A candidate that never armed emits nothing.
 *
 * The scale is CUMULATIVE from the baseline (not incremental), so the consumer
 * multiplies the widget's arm-time w/h by it — opening the hand grows, closing
 * (back toward the baseline and past it) shrinks. Framework/DOM-free; unit-tested
 * with synthetic openness streams.
 */

import type { StudioPhaseInput } from "./types";

export type OpenHandResizeSample = {
  t: number;
  /** Whole-hand openness scalar (mean tip/palm ratio) for this frame. */
  openness: number;
  /**
   * True while the hand is a resize candidate: open pose AND not pinching AND a
   * widget under the reticle. gesture-core pre-computes this; the recognizer only
   * watches its edges + the openness delta.
   */
  engaged: boolean;
};

export type OpenHandResizeConfig = {
  /** Continuous candidate dwell (ms) before resize arms (baseline captured). */
  armMs: number;
  /** |openness - baseline| below this emits scale 1.0 (steady-hand deadband). */
  deadband: number;
  /** Multiplier gain applied to the past-deadband openness delta. */
  gain: number;
  /** Lower clamp on the emitted scale. */
  minScale: number;
  /** Upper clamp on the emitted scale. */
  maxScale: number;
  /** Max scale change per ms (rate limit) so applied size eases, never snaps. */
  maxScaleStepPerMs: number;
  /** Skip emitting when the scale would move less than this (frame-rate quiet). */
  emitEpsilon: number;
};

export const DEFAULT_OPEN_HAND_RESIZE: OpenHandResizeConfig = {
  armMs: 300,
  deadband: 0.15,
  gain: 0.9,
  minScale: 0.4,
  maxScale: 2.5,
  maxScaleStepPerMs: 0.004,
  emitEpsilon: 0.004,
};

export type OpenHandResizeRecognizer = {
  push(sample: OpenHandResizeSample): void;
  reset(): void;
};

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Creates an open-hand resize recognizer. `onEvent` receives a targetless
 * `resizeStart`, a stream of cumulative `resizeMove{scale}`, and a terminal
 * `resizeEnd`. Calling `reset()` mid-resize emits `resizeEnd` first so a
 * hand-lost gap never strands a half-applied resize.
 */
export function createOpenHandResizeRecognizer(
  onEvent: (event: StudioPhaseInput) => void,
  config?: Partial<OpenHandResizeConfig>,
): OpenHandResizeRecognizer {
  const cfg: OpenHandResizeConfig = { ...DEFAULT_OPEN_HAND_RESIZE, ...config };

  let armStart: number | null = null; // candidate-dwell clock; null when not a candidate
  let armed = false;
  let baseline = 0;
  let emittedScale = 1;
  let lastT = 0;

  function reset(): void {
    if (armed) onEvent({ type: "resizeEnd" });
    armStart = null;
    armed = false;
    baseline = 0;
    emittedScale = 1;
    lastT = 0;
  }

  /** Target (unrate-limited) scale for an openness delta from the baseline. */
  function targetScale(openness: number): number {
    const delta = openness - baseline;
    const mag = Math.abs(delta);
    if (mag <= cfg.deadband) return 1;
    const scaled = 1 + cfg.gain * (mag - cfg.deadband) * Math.sign(delta);
    return clamp(scaled, cfg.minScale, cfg.maxScale);
  }

  function push(sample: OpenHandResizeSample): void {
    if (!sample.engaged) {
      reset();
      return;
    }

    // Candidate: run the arm dwell.
    if (!armed) {
      if (armStart === null) {
        armStart = sample.t;
        return;
      }
      if (sample.t - armStart < cfg.armMs) return;
      // Arm: capture baseline, start the resize lifecycle at scale 1.
      armed = true;
      baseline = sample.openness;
      emittedScale = 1;
      lastT = sample.t;
      onEvent({ type: "resizeStart" });
      onEvent({ type: "resizeMove", scale: 1 });
      return;
    }

    // Applying: rate-limit the emitted scale toward its openness target.
    const target = targetScale(sample.openness);
    const dt = Math.max(0, sample.t - lastT);
    lastT = sample.t;
    const maxStep = cfg.maxScaleStepPerMs * dt;
    const diff = target - emittedScale;
    const step = clamp(diff, -maxStep, maxStep);
    const next = emittedScale + step;
    if (Math.abs(next - emittedScale) < cfg.emitEpsilon) return;
    emittedScale = next;
    onEvent({ type: "resizeMove", scale: emittedScale });
  }

  return { push, reset };
}
