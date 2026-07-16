import { describe, expect, it } from "vitest";

import {
  createThumbConfirmRecognizer,
  DEFAULT_THUMB_CONFIRM,
  type ThumbConfirmSample,
} from "./thumb-confirm-recognizer";
import type { ThumbGesture } from "./hand/gesture-core";
import type { StudioIntentInput } from "./types";

function run(
  samples: ThumbConfirmSample[],
  config?: Parameters<typeof createThumbConfirmRecognizer>[1],
): StudioIntentInput[] {
  const events: StudioIntentInput[] = [];
  const rec = createThumbConfirmRecognizer((i) => events.push(i), config);
  for (const s of samples) rec.push(s);
  return events;
}

/** A steady stream of one gesture over `ms`, sampled every 16ms from t0. */
function hold(gesture: ThumbGesture, ms: number, t0 = 0): ThumbConfirmSample[] {
  const out: ThumbConfirmSample[] = [];
  for (let t = t0; t <= t0 + ms; t += 16) out.push({ t, gesture });
  return out;
}

describe("thumb-confirm recognizer", () => {
  it("fires confirmApprove after a sustained thumbs-up (holdMs)", () => {
    const events = run(hold("thumbUp", DEFAULT_THUMB_CONFIRM.holdMs + 20));
    expect(events).toEqual([{ type: "confirmApprove" }]);
  });

  it("fires confirmCancel after a sustained thumbs-down", () => {
    const events = run(hold("thumbDown", DEFAULT_THUMB_CONFIRM.holdMs + 20));
    expect(events).toEqual([{ type: "confirmCancel" }]);
  });

  it("does NOT fire on a brief thumb (a passing hand)", () => {
    // A thumb held only ~100ms, well under the 400ms hold.
    const events = run(hold("thumbUp", 100));
    expect(events).toEqual([]);
  });

  it("fires only once per sustained hold (latches)", () => {
    const events = run(hold("thumbUp", DEFAULT_THUMB_CONFIRM.holdMs + 400));
    expect(events).toEqual([{ type: "confirmApprove" }]);
  });

  it("re-anchors the dwell when the gesture flips, so up→down can't ride the hold", () => {
    // Hold up for 300ms (under threshold), then flip to down: the down hold must
    // start fresh, so a down that's only briefly held after the flip never fires.
    const events = run([
      ...hold("thumbUp", 300),
      ...hold("thumbDown", 100, 320),
    ]);
    expect(events).toEqual([]);
  });

  it("re-arms after leaving the pose and re-forming it", () => {
    const events = run([
      ...hold("thumbUp", DEFAULT_THUMB_CONFIRM.holdMs + 20), // fire #1
      { t: 700, gesture: null }, // leave the pose
      ...hold("thumbUp", DEFAULT_THUMB_CONFIRM.holdMs + 20, 720), // fire #2
    ]);
    expect(events).toEqual([{ type: "confirmApprove" }, { type: "confirmApprove" }]);
  });

  it("does nothing for a stream of nulls", () => {
    const events = run(hold(null, 1000));
    expect(events).toEqual([]);
  });

  it("reset() clears state silently", () => {
    const events: StudioIntentInput[] = [];
    const rec = createThumbConfirmRecognizer((i) => events.push(i));
    rec.push({ t: 0, gesture: "thumbUp" });
    rec.reset();
    expect(events).toEqual([]);
  });
});
