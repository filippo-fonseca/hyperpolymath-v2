import { describe, expect, it, vi } from "vitest";

import {
  createPinchBloomRecognizer,
  DEFAULT_PINCH_BLOOM,
} from "@/lib/studio/input/pinch-bloom-recognizer";

const HOLD = DEFAULT_PINCH_BLOOM.holdMs;
const WINDOW = DEFAULT_PINCH_BLOOM.bloomWindowMs;
const FPS = 1000 / 30;

/** Pinch for a few frames (well under holdMs), returning the last timestamp. */
function quickPinch(
  rec: ReturnType<typeof createPinchBloomRecognizer>,
  start = 0,
): number {
  let t = start;
  rec.push({ t, engaged: true, openPose: false }); // rising edge
  for (let i = 0; i < 3; i++) {
    rec.push({ t: (t += FPS), engaged: true, openPose: false });
  }
  return t; // ~100 ms of pinch, still < holdMs
}

describe("createPinchBloomRecognizer", () => {
  it("fires when the hand is already open at release (pose ahead of release)", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = quickPinch(rec);
    rec.push({ t: (t += FPS), engaged: false, openPose: true }); // quick release into open
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires when the open pose catches up within bloomWindowMs (debounce lag)", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = quickPinch(rec);
    rec.push({ t: (t += FPS), engaged: false, openPose: false }); // release, pose not open yet → arm watch
    rec.push({ t: (t += FPS), engaged: false, openPose: false }); // still catching up
    rec.push({ t: (t += FPS), engaged: false, openPose: true }); // open arrives ~66 ms later, < WINDOW
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when the pinch is held past holdMs (that is a grab)", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = 0;
    for (; t <= HOLD + FPS; t += FPS) {
      rec.push({ t, engaged: true, openPose: false });
    }
    rec.push({ t: (t += FPS), engaged: false, openPose: true }); // release into open, but held ≥ holdMs
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does NOT fire when the release goes into a fist (pinch → fist never blooms)", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = quickPinch(rec);
    rec.push({ t: (t += FPS), engaged: false, openPose: false }); // release into fist → arm watch
    for (let i = 0; i < 8; i++) {
      rec.push({ t: (t += FPS), engaged: false, openPose: false }); // stays closed past WINDOW
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does NOT fire when the open pose only arrives after the window has lapsed", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = quickPinch(rec);
    rec.push({ t: (t += FPS), engaged: false, openPose: false }); // release → arm watch
    for (let i = 0; i < 8; i++) {
      rec.push({ t: (t += FPS), engaged: false, openPose: false }); // window lapses (candidate dropped)
    }
    rec.push({ t: (t += FPS), engaged: false, openPose: true }); // open returns too late
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("fires at most once per pinch even while the hand stays open", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = quickPinch(rec);
    rec.push({ t: (t += FPS), engaged: false, openPose: true }); // bloom
    for (let i = 0; i < 10; i++) {
      rec.push({ t: (t += FPS), engaged: false, openPose: true }); // still open, must not re-fire
    }
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a fresh pinch after a bloom can fire again", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = quickPinch(rec);
    rec.push({ t: (t += FPS), engaged: false, openPose: true }); // bloom 1
    expect(onOpen).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) {
      rec.push({ t: (t += FPS), engaged: false, openPose: true }); // hand open between blooms
    }
    t = quickPinch(rec, t + FPS); // second pinch
    rec.push({ t: (t += FPS), engaged: false, openPose: true }); // bloom 2
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("a re-pinch abandons a half-finished bloom watch", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = quickPinch(rec);
    rec.push({ t: (t += FPS), engaged: false, openPose: false }); // quick release → arm watch
    rec.push({ t: (t += FPS), engaged: true, openPose: false }); // RE-PINCH → abandons the watch
    const secondStart = t;
    for (; t <= secondStart + HOLD + FPS; t += FPS) {
      rec.push({ t, engaged: true, openPose: false }); // hold the re-pinch past holdMs (a grab)
    }
    rec.push({ t: (t += FPS), engaged: false, openPose: true }); // release into open, but this was a grab
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("reset() clears a pending bloom watch silently", () => {
    const onOpen = vi.fn();
    const rec = createPinchBloomRecognizer(onOpen);
    let t = quickPinch(rec);
    rec.push({ t: (t += FPS), engaged: false, openPose: false }); // arm watch
    rec.reset();
    for (let i = 0; i < 3; i++) {
      rec.push({ t: (t += FPS), engaged: false, openPose: true }); // open after reset must not fire
    }
    expect(onOpen).not.toHaveBeenCalled();
  });
});
