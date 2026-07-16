/**
 * Pinch-bloom recognizer — the QUICK-PINCH TAP, the PRIMARY hand click, a pure
 * state machine mirroring `swipe-recognizer.ts` / `pinch-hold-recognizer.ts`.
 *
 * A bloom is a *quick* pinch that springs back open: pinch over a widget, then
 * release into an open hand before the grab-hold threshold. It reuses the
 * trusted pinch primitive (the cursor FREEZES the instant the pinch engages, so
 * the aim can't drift during the click) and is now the primary click — a quick
 * pinch-release taps whatever the reticle was over at pinch-start. A pinch HELD
 * past `holdMs` is instead a grab/drag (pinch-hold owns it): the two share
 * `holdMs`, so a single continuous threshold splits tap from grab with no race.
 *
 * Because the cursor is FROZEN while pinched, hover stays pinned to whatever the
 * reticle was over at pinch-start (re-anchored to the pre-pinch aim by
 * gesture-core), so a bloom performed off any card produces a targetless tap the
 * hub already drops — "pinch off a card = navigation only" falls out for free.
 *
 * Samples `{ t, engaged, openPose }`, both pre-computed by gesture-core:
 * `engaged` is the debounced pinch latch, `openPose` is `pose === "open"`.
 * Behavior:
 *  - On the RISING edge of `engaged`, record the engage time (and cancel any
 *    pending watch — a re-pinch abandons a half-finished tap).
 *  - On the FALLING edge, if the pinch was held for less than `holdMs` it is a
 *    tap candidate: fire `onTap()` once the hand reads open, allowing a short
 *    `bloomWindowMs` for the pose debounce to catch up after release. A release
 *    at or past `holdMs` is a grab (pinch-hold owns it), never a tap.
 *  - Fires at most once per pinch, then latches until the next engage.
 *
 * `holdMs` is deliberately the SAME threshold pinch-hold uses (gesture-core
 * passes the shared `grabHoldMs`), giving exact mutual exclusion: release before
 * T ⇒ tap, still pinched at T ⇒ grab. No overlap, no race. The threshold lives
 * here, not in the hub, so the hub stays clock-free. Downstream this drives a
 * targetless `tap` the hub upgrades from the pinned hover — the SAME `tap`
 * intent palm-click emits, so pointer-synth's dispatch path is unchanged.
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
 * Creates a pinch-bloom recognizer. `onTap` fires at most once per pinch (a
 * quick release into an open hand). `reset()` clears state silently — a tap is
 * a one-shot, not a lifecycle, so a hand-lost gap never fires it.
 */
export function createPinchBloomRecognizer(
  onTap: () => void,
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
          onTap(); // pose already open at release → fire now
        } else {
          watchUntil = t + cfg.bloomWindowMs; // wait for the pose to catch up
        }
      }
    }

    // Watching after a candidate release: fire when the open pose arrives, or
    // give up once the window lapses (release → fist / lost hand never blooms).
    if (!engaged && watchUntil !== null) {
      if (openPose) {
        onTap();
        watchUntil = null;
      } else if (t > watchUntil) {
        watchUntil = null;
      }
    }

    prevEngaged = engaged;
  }

  return { push, reset };
}
