import { describe, expect, it } from "vitest";

import { computePinchShapeValid, DEFAULT_HAND_GESTURE, type Pt } from "./gesture-core";

/**
 * A synthetic hand for the pinch-shape guard. Wrist at (0.5, 0.9); middle-MCP
 * 0.2 above it (palm size 0.2). Middle/ring/pinky curl to a controllable
 * `otherFingerReach` (tip/palm ratio) — the guard's whole point is separating a
 * real pinch (those three stay extended) from a fist (they curl in with the
 * index). Thumb/index positions are irrelevant to this guard (it only reads
 * middle/ring/pinky), so they're left at the default placeholder.
 */
function pinchGuardHand(otherFingerReach: number): Pt[] {
  const pts: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const wristY = 0.9;
  const palm = 0.2;
  pts[0] = { x: 0.5, y: wristY, z: 0 }; // WRIST
  pts[9] = { x: 0.5, y: wristY - palm, z: 0 }; // MIDDLE_MCP → palm size 0.2
  const tipY = wristY - otherFingerReach * palm;
  // Index tip (8) drawn in tight to the thumb (irrelevant to this guard, kept
  // curled like a pinch would have it); middle/ring/pinky (12/16/20) vary.
  pts[8] = { x: 0.5, y: wristY - 1.0 * palm, z: 0 };
  for (const tip of [12, 16, 20]) pts[tip] = { x: 0.5, y: tipY, z: 0 };
  return pts;
}

const { pinchMinNonPinchFingerRatio } = DEFAULT_HAND_GESTURE;

describe("computePinchShapeValid", () => {
  it("is valid (true) when middle/ring/pinky stay extended (a real pinch shape)", () => {
    const hand = pinchGuardHand(1.8); // well above the threshold
    expect(computePinchShapeValid(hand, pinchMinNonPinchFingerRatio)).toBe(true);
  });

  it("is INVALID (false) when middle/ring/pinky all curl in (a fist shape)", () => {
    const hand = pinchGuardHand(1.1); // below the threshold
    expect(computePinchShapeValid(hand, pinchMinNonPinchFingerRatio)).toBe(false);
  });

  it("is valid if just one of middle/ring/pinky stays extended", () => {
    const pts = pinchGuardHand(1.1); // all three curled...
    pts[12] = { x: 0.5, y: 0.9 - 1.8 * 0.2, z: 0 }; // ...except middle, extended
    expect(computePinchShapeValid(pts, pinchMinNonPinchFingerRatio)).toBe(true);
  });

  it("returns false for a degenerate (zero-size) palm", () => {
    const flat: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.3, y: 0.3, z: 0 }));
    expect(computePinchShapeValid(flat, pinchMinNonPinchFingerRatio)).toBe(false);
  });
});
