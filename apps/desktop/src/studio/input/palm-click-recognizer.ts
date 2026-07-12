/**
 * Palm-click recognizer — the PRIMARY hand click, a pure state machine mirroring
 * the other recognizers here (`tap-click` — which it replaces — `pinch-bloom`,
 * `pinch-hold`).
 *
 * A click is a PALM CLOSE-then-OPEN: the hand collapses into a fist and springs
 * back open within a short window. It replaces index-jab tap-to-click because a
 * jab's driving signal (index-tip depth) rides the SAME index finger that steers
 * the cursor, so jabbing accidentally drags the cursor along with it. A palm
 * close is orthogonal to cursor steering (the cursor only tracks the index tip
 * while `open`/`point`; a closing fist is neither), so closing to click can never
 * fight aiming.
 *
 * Driving signal: gesture-core's whole-hand openness scalar
 * (`computeHandOpenness`, mean tip/palm ratio) PLUS the individual per-finger
 * curl state (`fingerExtended`), so a low openness scalar alone never triggers —
 * all four fingers (index/middle/ring/pinky) must read curled too, matching how
 * `poseFromFingers`/`computeThumbGesture` gate on individual finger state rather
 * than the scalar in isolation.
 *
 * State machine, per frame while `engaged` (not pinching):
 *   1. IDLE: watching for a close. `closed` rising ⇒ enter CLOSING, record the
 *      close-start time and FREEZE the aim point at the sample's `nx`/`ny` (the
 *      caller hands in the current smoothed cursor position at that instant —
 *      this recognizer never computes cursor coords itself).
 *   2. CLOSING: watching for the reopen.
 *        - `closed` false (a reopen) within `reopenWindowMs` of close-start ⇒
 *          FIRE a targetless `tap` at the frozen point, return to IDLE.
 *        - `closed` still true past `cancelMs` (held fist, not a click) ⇒
 *          CANCEL: release the freeze without firing, return to IDLE.
 *        - `engaged` drops (pinch engages, or the hand is lost) mid-close ⇒
 *          CANCEL via `reset()`, same as above.
 *   `reopenWindowMs` < `cancelMs` by construction (a reopen inside the window
 *   always wins before the cancel dwell elapses), but both are exposed so a
 *   caller can reason about the gap between them (a fist held between the two
 *   thresholds this frame reads as "still closing," not yet cancelled).
 *
 * Exposes `state`/`framePoint()` so gesture-core can query "is a click candidate
 * in flight" (to suppress cursor emission and freeze the aim while closed) and
 * "what point is frozen" (so sibling gestures — resize — can disarm during the
 * candidate window) without either living inside this pure module.
 *
 * Emits a targetless `tap` intent — IDENTICAL to the retired tap-click's output,
 * so the hub's hover-upgrade, `StudioHandReticle`'s click-pop, and
 * `pointer-synth`'s pointerdown/up dispatch all keep working unchanged; only the
 * gesture that produces `tap` changes. Framework/DOM-free; unit-tested with
 * synthetic closed/openness streams. `reset()` clears silently — a click is a
 * one-shot, not a lifecycle, so a hand-lost gap never fires it.
 */

import type { StudioIntentInput } from "./types";

export type PalmClickSample = {
  t: number;
  /**
   * True when the hand reads as a closed fist THIS frame: gesture-core computes
   * this from BOTH the whole-hand openness scalar (below a low threshold) AND
   * all four fingers individually curled — never from the scalar alone.
   */
  closed: boolean;
  /**
   * The current smoothed cursor position (from the one-euro cursor filter),
   * palm-relative frame's aim. Only read on the close-START frame (frozen from
   * there on); a closed fist distorts the fingertip signal, so the caller should
   * stop feeding fresh values into its own cursor pipeline while closed — this
   * recognizer doesn't do that suppression itself, it only freezes what it's
   * given at the moment of closing.
   */
  nx: number;
  ny: number;
  /**
   * True while palm-click is a candidate: not pinching (gesture-core gates this
   * exactly like tap-click did). A false sample resets any in-flight close
   * WITHOUT firing — mid-close hand-loss or a pinch engaging both cancel.
   */
  engaged: boolean;
};

export type PalmClickConfig = {
  /** Ms after close-START within which a reopen fires the click. */
  reopenWindowMs: number;
  /** Ms a fist can be held before it's treated as cancelled (not a click). */
  cancelMs: number;
};

export const DEFAULT_PALM_CLICK: PalmClickConfig = {
  reopenWindowMs: 600,
  cancelMs: 700,
};

export type PalmClickState = "idle" | "closing";

export type PalmClickRecognizer = {
  push(sample: PalmClickSample): void;
  reset(): void;
  /** Current lifecycle state — "closing" while a click candidate is in flight. */
  readonly state: PalmClickState;
  /** The frozen aim point while `state === "closing"`, else null. */
  framePoint(): { nx: number; ny: number } | null;
};

/**
 * Creates a palm-click recognizer. `onTap` fires at most once per close→open
 * round trip, at the frozen close-start point, respecting the reopen window.
 */
export function createPalmClickRecognizer(
  onTap: (intent: StudioIntentInput) => void,
  config?: Partial<PalmClickConfig>,
): PalmClickRecognizer {
  const cfg: PalmClickConfig = { ...DEFAULT_PALM_CLICK, ...config };

  let state: PalmClickState = "idle";
  let closeStart = 0;
  let frozen: { nx: number; ny: number } | null = null;

  function reset(): void {
    state = "idle";
    closeStart = 0;
    frozen = null;
  }

  function push(sample: PalmClickSample): void {
    if (!sample.engaged) {
      // Pinch engaged, or the hand was lost mid-close: cancel silently, no click.
      reset();
      return;
    }

    if (state === "idle") {
      if (sample.closed) {
        // Close-START: freeze the aim at the current smoothed cursor position.
        state = "closing";
        closeStart = sample.t;
        frozen = { nx: sample.nx, ny: sample.ny };
      }
      return;
    }

    // state === "closing"
    if (!sample.closed) {
      // Reopen. Inside the window ⇒ click at the frozen point; past it, the
      // close had already run long enough that this is a stale/late reopen of
      // what cancelMs will otherwise catch — still resolve as a click only if
      // still inside reopenWindowMs, else fall through to idle without firing.
      const dt = sample.t - closeStart;
      const point = frozen;
      reset();
      if (dt <= cfg.reopenWindowMs && point) {
        onTap({ type: "tap" });
      }
      return;
    }

    // Still closed: check the cancel dwell.
    if (sample.t - closeStart >= cfg.cancelMs) {
      reset(); // held too long — cancelled, no click, freeze released
    }
  }

  return {
    push,
    reset,
    get state() {
      return state;
    },
    framePoint: () => frozen,
  };
}
