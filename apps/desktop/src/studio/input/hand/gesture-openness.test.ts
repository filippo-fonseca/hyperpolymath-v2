import { describe, expect, it } from "vitest";

import { computeFingerRatios, computeHandOpenness, type Pt } from "./gesture-core";

/**
 * A synthetic hand: wrist at origin, middle-MCP one unit up (palm size = 1), and
 * the four fingertips at a controllable extension `reach` (distance from wrist).
 * Fingertip landmarks are indices 8/12/16/20; every other index gets a harmless
 * placeholder so the arrays are the right length for the pure math.
 */
function syntheticHand(reach: number): Pt[] {
  const pts: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  pts[0] = { x: 0.5, y: 0.9, z: 0 }; // WRIST
  pts[9] = { x: 0.5, y: 0.9 - 0.2, z: 0 }; // MIDDLE_MCP → palm size 0.2
  // Palm size = dist(wrist, middleMcp) = 0.2. Put tips `reach * 0.2` above wrist.
  const tipY = 0.9 - reach * 0.2;
  for (const tip of [8, 12, 16, 20]) pts[tip] = { x: 0.5, y: tipY, z: 0 };
  return pts;
}

describe("computeHandOpenness", () => {
  it("is the mean of the four per-finger tip/palm ratios", () => {
    const hand = syntheticHand(1.8);
    const ratios = computeFingerRatios(hand);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(computeHandOpenness(hand)).toBeCloseTo(mean, 6);
  });

  it("rises monotonically as the hand opens (fist < point-ish < open)", () => {
    const fist = computeHandOpenness(syntheticHand(1.1));
    const half = computeHandOpenness(syntheticHand(1.5));
    const open = computeHandOpenness(syntheticHand(2.0));
    expect(fist).toBeLessThan(half);
    expect(half).toBeLessThan(open);
    // Sanity on the documented bands: a closed hand reads low, an open hand high.
    expect(fist).toBeCloseTo(1.1, 5);
    expect(open).toBeCloseTo(2.0, 5);
  });

  it("is scale/depth-invariant (palm-normalized): same pose at 2x scale is equal", () => {
    const near = syntheticHand(1.8);
    // Same POSE, twice as large/close: scale every coordinate about the origin.
    const far: Pt[] = near.map((p) => ({ x: p.x * 2, y: p.y * 2, z: 0 }));
    expect(computeHandOpenness(far)).toBeCloseTo(computeHandOpenness(near), 6);
  });

  it("returns 0 for a degenerate (zero-size) palm", () => {
    const flat: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.3, y: 0.3, z: 0 }));
    expect(computeHandOpenness(flat)).toBe(0);
  });
});
