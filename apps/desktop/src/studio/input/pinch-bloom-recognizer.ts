/**
 * Pinch-bloom recognizer — the "open a widget" primitive, a pure state machine
 * mirroring `swipe-recognizer.ts` / `pinch-hold-recognizer.ts`.
 *
 * A bloom is a *quick* pinch that springs back open: pinch over a widget, then
 * release into an open hand before the grab-hold threshold. It replaces the old
 * point-tap/hold open gesture (which dragged the reticle off-target as the hand
 * moved). Because the cursor is FROZEN while pinched, hover stays pinned to
 * whatever the reticle was over at pinch-start, so a bloom performed off any
 * card produces a targetless open the hub already drops — "pinch off a card =
 * navigation only" falls out for free.
 *
 * Samples `{ t, engaged, openPose }`, both pre-computed by gesture-core:
 * `engaged` is the debounced pinch latch, `openPose` is `pose === "open"`.
 * Behavior:
 *  - On the RISING edge of `engaged`, record the engage time (and cancel any
 *    pending watch — a re-pinch abandons a half-finished bloom).
 *  - On the FALLING edge, if the pinch was held for less than `holdMs` it is a
 *    bloom candidate: fire `onOpen()` once the hand reads open, allowing a short
 *    `bloomWindowMs` for the pose debounce to catch up after release. A release
 *    at or past `holdMs` is a grab (pinch-hold owns it), never a bloom.
 *  - Fires at most once per pinch, then latches until the next engage.
 *
 * `holdMs` is deliberately the SAME threshold pinch-hold uses (gesture-core
 * passes the shared `grabHoldMs`), giving exact mutual exclusion: release before
 * T ⇒ bloom, still pinched at T ⇒ grab. No overlap, no race. The threshold lives
 * here, not in the hub, so the hub stays clock-free. Downstream this drives a
 * targetless `expand` the hub upgrades from the pinned hover.
 */

export type PinchBloomSample = {
  t: number;
  /** True while the debounced pinch latch is engaged. */
  engaged: boolean;
  /** True when the pose classifier reads an open hand this frame. */
  openPose: boolean;
};

export type PinchBloomConfig = {
  /** Max continuous engagement (ms) for a release to count as a bloom, not a grab. */
  holdMs: number;
  /** Grace (ms) after release for the open pose to arrive (pose debounce lag). */
  bloomWindowMs: number;
};

export const DEFAULT_PINCH_BLOOM: PinchBloomConfig = {
  holdMs: 350,
  bloomWindowMs: 150,
};

export type PinchBloomRecognizer = {
  push(sample: PinchBloomSample): void;
  reset(): void;
};

/**
 * Creates a pinch-bloom recognizer. `onOpen` fires at most once per pinch (a
 * quick release into an open hand). `reset()` clears state silently — a bloom is
 * a one-shot open, not a lifecycle, so a hand-lost gap never fires it.
 */
export function createPinchBloomRecognizer(
  onOpen: () => void,
  config?: Partial<PinchBloomConfig>,
): PinchBloomRecognizer {
  const cfg: PinchBloomConfig = { ...DEFAULT_PINCH_BLOOM, ...config };

  let engagedSince: number | null = null; // rising-edge time; null when released
  let watchUntil: number | null = null; // watching for open pose until this t
  let prevEngaged = false;

  function reset(): void {
    engagedSince = null;
    watchUntil = null;
    prevEngaged = false;
  }

  function push(sample: PinchBloomSample): void {
    const { t, engaged, openPose } = sample;

    // Rising edge: a fresh pinch begins — time it, and abandon any pending watch.
    if (engaged && !prevEngaged) {
      engagedSince = t;
      watchUntil = null;
    }

    // Falling edge: the pinch released. A sub-holdMs release is a bloom candidate.
    if (!engaged && prevEngaged) {
      const heldMs = engagedSince === null ? Infinity : t - engagedSince;
      engagedSince = null;
      if (heldMs < cfg.holdMs) {
        if (openPose) {
          onOpen(); // pose already open at release → fire now
        } else {
          watchUntil = t + cfg.bloomWindowMs; // wait for the pose to catch up
        }
      }
    }

    // Watching after a candidate release: fire when the open pose arrives, or
    // give up once the window lapses (release → fist / lost hand never blooms).
    if (!engaged && watchUntil !== null) {
      if (openPose) {
        onOpen();
        watchUntil = null;
      } else if (t > watchUntil) {
        watchUntil = null;
      }
    }

    prevEngaged = engaged;
  }

  return { push, reset };
}
