/**
 * Point-open recognizer — the "open a widget" primitive, a pure state machine
 * mirroring `swipe-recognizer.ts`.
 *
 * The old open gesture (a quick fist pulse) dragged the reticle off the target
 * as the hand closed. This replaces it with a stationary intent: aim the index
 * finger at a widget, then EITHER
 *   1. Tap — poke the fingertip toward the camera (a forward jab: apparent
 *      forward depth rising `jabDelta` past its resting baseline), OR
 *   2. Hold — keep the point steady (drift under `maxDriftNx`) for `dwellMs`.
 * Either path fires a single `open`. The tap is the fast path; the hold is the
 * always-works fallback so a noisy depth signal never leaves the user stuck.
 *
 * After firing it latches until the point ends (any non-pointing frame), so one
 * gesture = one open. `pointing`, `nx/ny` (reticle position) and `forward` (a
 * monotonic depth proxy, bigger = nearer the camera) are pre-computed by the
 * caller (gesture-core). Downstream this drives `expand`.
 */

export type PointOpenSample = {
  t: number;
  /** True when the caller classifies this frame as a deliberate index point. */
  pointing: boolean;
  /** Reticle x (0..1) — the index-tip cursor target, for the drift gate. */
  nx: number;
  /** Reticle y (0..1). */
  ny: number;
  /** Forward depth proxy of the fingertip; rises as the finger nears the camera. */
  forward: number;
};

export type PointOpenConfig = {
  /** Still-point dwell (ms) that opens without a tap. */
  dwellMs: number;
  /** Reticle drift (normalized) that restarts the dwell clock. */
  maxDriftNx: number;
  /** Forward rise past the resting baseline that counts as a deliberate tap. */
  jabDelta: number;
};

export const DEFAULT_POINT_OPEN: PointOpenConfig = {
  dwellMs: 500,
  maxDriftNx: 0.06,
  jabDelta: 0.1,
};

export type PointOpenRecognizer = {
  push(sample: PointOpenSample): void;
  reset(): void;
};

/**
 * Creates a point-open recognizer. `onOpen` fires at most once per continuous
 * point (tap fast-path or dwell fallback).
 */
export function createPointOpenRecognizer(
  onOpen: () => void,
  config?: Partial<PointOpenConfig>,
): PointOpenRecognizer {
  const cfg: PointOpenConfig = { ...DEFAULT_POINT_OPEN, ...config };

  let anchor: { t: number; nx: number; ny: number } | null = null;
  // Resting (farthest) forward depth since the point began; a tap stands out
  // as a rise above it, so it tracks the running minimum.
  let restingForward = Infinity;
  let fired = false;

  function reset(): void {
    anchor = null;
    restingForward = Infinity;
    fired = false;
  }

  function push(sample: PointOpenSample): void {
    if (!sample.pointing) {
      // Any non-pointing frame breaks the gesture entirely (unlatches).
      reset();
      return;
    }

    if (anchor === null) {
      anchor = { t: sample.t, nx: sample.nx, ny: sample.ny };
      restingForward = sample.forward;
      fired = false;
      return;
    }

    if (fired) return; // latched until the point ends

    // Tap fast-path: a forward poke past the resting baseline fires immediately.
    if (sample.forward < restingForward) restingForward = sample.forward;
    if (sample.forward - restingForward >= cfg.jabDelta) {
      fired = true;
      onOpen();
      return;
    }

    // Dwell fallback: a still point restarts on drift, else fires at dwellMs.
    const drift = Math.hypot(sample.nx - anchor.nx, sample.ny - anchor.ny);
    if (drift > cfg.maxDriftNx) {
      anchor = { t: sample.t, nx: sample.nx, ny: sample.ny };
      return;
    }

    if (sample.t - anchor.t >= cfg.dwellMs) {
      fired = true;
      onOpen();
    }
  }

  return { push, reset };
}
