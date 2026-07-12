/**
 * Thumb-confirm recognizer — the thumbs-up / thumbs-down answer to the send
 * confirm gate, a pure state machine mirroring the other recognizers here.
 *
 * A thumbs-up held steady for `holdMs` fires `confirmApprove`; a thumbs-down held
 * `holdMs` fires `confirmCancel`. The HOLD is the whole point: a passing hand that
 * momentarily reads as a thumb (mid-gesture, or waving by) must not send a
 * message, so a decisive, sustained thumb is required. gesture-core classifies the
 * raw pose per frame (`computeThumbGesture`) and feeds this recognizer the result;
 * this state machine adds the dwell + one-shot latch.
 *
 * Per frame:
 *   - A `thumbUp`/`thumbDown` that MATCHES the currently-tracked gesture and has
 *     been held continuously for `holdMs` fires once, then latches (no repeat
 *     until the hand leaves the pose and re-forms it).
 *   - Any change of gesture (up→down, or → null / neither) re-anchors the dwell
 *     clock, so switching from up to down starts a fresh hold — you can't ride an
 *     up-hold into an accidental cancel.
 *
 * Emits targetless `confirmApprove`/`confirmCancel` intents. The confirm gate,
 * not the hub, decides whether a pending send exists to answer, so these pass
 * through the hub unchanged. `reset()` clears silently (a confirm is a one-shot,
 * never a lifecycle). Framework/DOM-free; unit-tested with synthetic streams.
 */

import type { ThumbGesture } from "./hand/gesture-core";
import type { StudioIntentInput } from "./types";

export type ThumbConfirmSample = {
  t: number;
  /** The per-frame thumb classification from gesture-core, or null for neither. */
  gesture: ThumbGesture;
};

export type ThumbConfirmConfig = {
  /** Continuous ms a thumb must be held before it fires (anti-passing-hand). */
  holdMs: number;
};

export const DEFAULT_THUMB_CONFIRM: ThumbConfirmConfig = {
  holdMs: 400,
};

export type ThumbConfirmRecognizer = {
  push(sample: ThumbConfirmSample): void;
  reset(): void;
};

/**
 * Creates a thumb-confirm recognizer. `onConfirm` fires at most once per sustained
 * thumb, on the frame the hold threshold is crossed.
 */
export function createThumbConfirmRecognizer(
  onConfirm: (intent: StudioIntentInput) => void,
  config?: Partial<ThumbConfirmConfig>,
): ThumbConfirmRecognizer {
  const cfg: ThumbConfirmConfig = { ...DEFAULT_THUMB_CONFIRM, ...config };

  let tracked: ThumbGesture = null; // the gesture currently being timed
  let heldSince = 0; // t at which `tracked` began
  let fired = false; // latched after firing until the pose changes

  function reset(): void {
    tracked = null;
    heldSince = 0;
    fired = false;
  }

  function push(sample: ThumbConfirmSample): void {
    const { t, gesture } = sample;

    // A gesture change (including → null) re-anchors the dwell and clears the latch.
    if (gesture !== tracked) {
      tracked = gesture;
      heldSince = t;
      fired = false;
      return;
    }

    // No thumb, or already fired for this hold: nothing to do.
    if (gesture === null || fired) return;

    if (t - heldSince >= cfg.holdMs) {
      fired = true;
      onConfirm({ type: gesture === "thumbUp" ? "confirmApprove" : "confirmCancel" });
    }
  }

  return { push, reset };
}
