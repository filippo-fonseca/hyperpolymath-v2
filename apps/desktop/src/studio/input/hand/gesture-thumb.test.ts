import { describe, expect, it } from "vitest";

import {
  computeIndexTipDepth,
  computeThumbExtension,
  computeThumbGesture,
  computeThumbVertical,
  DEFAULT_THUMB_GESTURE,
  type Pt,
} from "./gesture-core";

/**
 * A synthetic hand for thumb tests. Wrist at (0.5, 0.9); middle-MCP 0.2 above it
 * (palm size 0.2). The four fingers curl to a controllable `fingerReach`
 * (tip/palm ratio). The thumb tip is placed by `thumbReach` (extension) and
 * `thumbDir` (+1 = up, −1 = down, 0 = sideways); the thumb-MCP (index 2) sits
 * half a palm out from the wrist so the vertical is measured MCP→tip. `indexZ`
 * sets the index tip's z (default equal to the palm plane's).
 */
function thumbHand(opts: {
  fingerReach: number;
  thumbReach: number;
  thumbDir: number;
  indexZ?: number;
}): Pt[] {
  const { fingerReach, thumbReach, thumbDir, indexZ } = opts;
  const pts: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const wristY = 0.9;
  const palm = 0.2;
  pts[0] = { x: 0.5, y: wristY, z: 0 }; // WRIST
  pts[9] = { x: 0.5, y: wristY - palm, z: 0 }; // MIDDLE_MCP → palm size 0.2
  // Four fingers at fingerReach * palm above the wrist.
  const tipY = wristY - fingerReach * palm;
  for (const tip of [8, 12, 16, 20]) pts[tip] = { x: 0.5, y: tipY, z: 0 };
  if (indexZ !== undefined) pts[8] = { ...pts[8]!, z: indexZ };
  // Thumb-MCP (index 2): out to the side, level with the wrist.
  pts[2] = { x: 0.5 + palm * 0.5, y: wristY, z: 0 };
  // Thumb-tip (index 4): thumbReach * palm from the wrist, aimed by thumbDir.
  pts[4] = {
    x: 0.5 + palm * 0.5,
    y: wristY - thumbDir * thumbReach * palm,
    z: 0,
  };
  return pts;
}

describe("computeThumbExtension", () => {
  it("is scale/depth-invariant (palm-normalized)", () => {
    const near = thumbHand({ fingerReach: 1.1, thumbReach: 1.4, thumbDir: 1 });
    const far: Pt[] = near.map((p) => ({ x: p.x * 2, y: p.y * 2, z: p.z * 2 }));
    expect(computeThumbExtension(far)).toBeCloseTo(computeThumbExtension(near), 5);
  });

  it("returns 0 for a degenerate palm", () => {
    const flat: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.3, y: 0.3, z: 0 }));
    expect(computeThumbExtension(flat)).toBe(0);
  });
});

describe("computeThumbVertical", () => {
  it("is POSITIVE for a thumb aimed up (tip above MCP; smaller y)", () => {
    const up = thumbHand({ fingerReach: 1.1, thumbReach: 1.4, thumbDir: 1 });
    expect(computeThumbVertical(up)).toBeGreaterThan(0);
  });

  it("is NEGATIVE for a thumb aimed down", () => {
    const down = thumbHand({ fingerReach: 1.1, thumbReach: 1.4, thumbDir: -1 });
    expect(computeThumbVertical(down)).toBeLessThan(0);
  });
});

describe("computeThumbGesture", () => {
  it("classifies a clear thumbs-up (fingers curled, thumb up)", () => {
    const up = thumbHand({ fingerReach: 1.1, thumbReach: 1.6, thumbDir: 1 });
    expect(computeThumbGesture(up)).toBe("thumbUp");
  });

  it("classifies a clear thumbs-down", () => {
    const down = thumbHand({ fingerReach: 1.1, thumbReach: 1.6, thumbDir: -1 });
    expect(computeThumbGesture(down)).toBe("thumbDown");
  });

  it("returns null when the fingers are NOT curled (open hand)", () => {
    const open = thumbHand({ fingerReach: 2.0, thumbReach: 1.6, thumbDir: 1 });
    expect(computeThumbGesture(open)).toBeNull();
  });

  it("returns null when the thumb is not extended", () => {
    const tucked = thumbHand({ fingerReach: 1.1, thumbReach: 0.5, thumbDir: 1 });
    expect(computeThumbGesture(tucked)).toBeNull();
  });

  it("returns null for a sideways thumb (neither up nor down)", () => {
    const sideways = thumbHand({ fingerReach: 1.1, thumbReach: 1.6, thumbDir: 0 });
    expect(computeThumbGesture(sideways)).toBeNull();
  });

  it("respects custom thresholds", () => {
    const up = thumbHand({ fingerReach: 1.1, thumbReach: 1.6, thumbDir: 1 });
    // Demand an impossibly high extension → no longer classifies.
    expect(
      computeThumbGesture(up, { ...DEFAULT_THUMB_GESTURE, minThumbExtension: 99 }),
    ).toBeNull();
  });

  it("returns null for a degenerate palm", () => {
    const flat: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.3, y: 0.3, z: 0 }));
    expect(computeThumbGesture(flat)).toBeNull();
  });
});

describe("computeIndexTipDepth", () => {
  it("is ~0 when the index tip sits in the palm plane", () => {
    const rest = thumbHand({ fingerReach: 1.6, thumbReach: 1.2, thumbDir: 0, indexZ: 0 });
    expect(computeIndexTipDepth(rest)).toBeCloseTo(0, 6);
  });

  it("goes NEGATIVE as the index tip pushes toward the camera (smaller z)", () => {
    const jab = thumbHand({ fingerReach: 1.6, thumbReach: 1.2, thumbDir: 0, indexZ: -0.1 });
    expect(computeIndexTipDepth(jab)).toBeLessThan(0);
  });

  it("is palm-normalized (scale-invariant)", () => {
    const near = thumbHand({ fingerReach: 1.6, thumbReach: 1.2, thumbDir: 0, indexZ: -0.1 });
    const far: Pt[] = near.map((p) => ({ x: p.x * 2, y: p.y * 2, z: p.z * 2 }));
    expect(computeIndexTipDepth(far)).toBeCloseTo(computeIndexTipDepth(near), 6);
  });

  it("returns 0 for a degenerate palm", () => {
    const flat: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.3, y: 0.3, z: 0 }));
    expect(computeIndexTipDepth(flat)).toBe(0);
  });
});
