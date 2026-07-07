import { describe, expect, it } from "vitest";

import { STUDIO_BLOOM, STUDIO_RIM } from "../postfx.params";

/**
 * Doctrine invariants only — NOT brittle value snapshots. These guard the two
 * contracts a future tune must not silently break: the HDR opt-in threshold and
 * a hover that still reads as a clear state change.
 */
describe("STUDIO_BLOOM", () => {
  it("keeps the HDR opt-in threshold at exactly 1 (tone-mapped content never blooms)", () => {
    expect(STUDIO_BLOOM.luminanceThreshold).toBe(1);
  });

  it("uses a small smoothing feather, never a de-facto lower threshold", () => {
    expect(STUDIO_BLOOM.luminanceSmoothing).toBeGreaterThan(0);
    expect(STUDIO_BLOOM.luminanceSmoothing).toBeLessThanOrEqual(0.3);
  });

  it("keeps bloom intensity restrained (0 < intensity ≤ 1.2, the prior ceiling)", () => {
    expect(STUDIO_BLOOM.intensity).toBeGreaterThan(0);
    expect(STUDIO_BLOOM.intensity).toBeLessThanOrEqual(1.2);
  });
});

describe("STUDIO_RIM", () => {
  it("keeps the rest rim above 1 so it still blooms faintly", () => {
    expect(STUDIO_RIM.rest).toBeGreaterThan(1);
  });

  it("makes full hover read as a clear state change (> 2× the rest rim)", () => {
    expect(STUDIO_RIM.rest + STUDIO_RIM.hoverBoost).toBeGreaterThan(
      STUDIO_RIM.rest * 2,
    );
  });
});
