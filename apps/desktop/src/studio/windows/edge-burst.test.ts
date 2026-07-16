import { describe, expect, it } from "vitest";

import {
  BURST_THRESHOLD,
  EDGE_ZONE,
  edgeOutwardDirection,
  shouldBurst,
  widgetEdgeProgress,
} from "./edge-burst";

describe("widgetEdgeProgress", () => {
  it("is zero anywhere outside the edge zone", () => {
    expect(widgetEdgeProgress({ x: 0.5, y: 0.5 })).toBe(0);
    expect(widgetEdgeProgress({ x: EDGE_ZONE, y: 0.5 })).toBeCloseTo(0);
    expect(widgetEdgeProgress({ x: 0.5, y: 1 - EDGE_ZONE })).toBeCloseTo(0);
    // Just inside the safe zone stays inert — no accidental arming mid-stage.
    expect(widgetEdgeProgress({ x: EDGE_ZONE + 0.001, y: 0.5 })).toBe(0);
  });

  it("ramps from 0 to 1 as the center pushes to the border", () => {
    // Halfway into the zone on the left edge → ~0.5.
    expect(widgetEdgeProgress({ x: EDGE_ZONE / 2, y: 0.5 })).toBeCloseTo(0.5);
    // At the border → full progress.
    expect(widgetEdgeProgress({ x: 0, y: 0.5 })).toBe(1);
    expect(widgetEdgeProgress({ x: 1, y: 0.5 })).toBe(1);
    expect(widgetEdgeProgress({ x: 0.5, y: 0 })).toBe(1);
    expect(widgetEdgeProgress({ x: 0.5, y: 1 })).toBe(1);
  });

  it("clamps beyond-border centers to 1", () => {
    expect(widgetEdgeProgress({ x: -0.3, y: 0.5 })).toBe(1);
    expect(widgetEdgeProgress({ x: 0.5, y: 1.4 })).toBe(1);
  });

  it("uses whichever axis is deepest into its zone", () => {
    // Corner: both axes deep; nearest border wins.
    const corner = widgetEdgeProgress({ x: 0.02, y: 0.03 });
    const single = widgetEdgeProgress({ x: 0.02, y: 0.5 });
    expect(corner).toBe(single);
    expect(corner).toBeGreaterThan(0.7);
  });
});

describe("shouldBurst", () => {
  it("commits only at or past the threshold", () => {
    expect(shouldBurst(BURST_THRESHOLD - 0.01)).toBe(false);
    expect(shouldBurst(BURST_THRESHOLD)).toBe(true);
    expect(shouldBurst(1)).toBe(true);
  });
});

describe("edgeOutwardDirection", () => {
  it("points out through the nearest border", () => {
    expect(edgeOutwardDirection({ x: 0.03, y: 0.5 })).toEqual({ x: -1, y: 0 });
    expect(edgeOutwardDirection({ x: 0.97, y: 0.5 })).toEqual({ x: 1, y: 0 });
    expect(edgeOutwardDirection({ x: 0.5, y: 0.02 })).toEqual({ x: 0, y: -1 });
    expect(edgeOutwardDirection({ x: 0.5, y: 0.98 })).toEqual({ x: 0, y: 1 });
  });
});
