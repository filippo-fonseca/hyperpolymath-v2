import { describe, expect, it } from "vitest";

import { prefersReducedMotion } from "./hud-settings";

describe("prefersReducedMotion", () => {
  it("defers to the system signal in system mode", () => {
    expect(prefersReducedMotion("system", true)).toBe(true);
    expect(prefersReducedMotion("system", false)).toBe(false);
  });

  it("forces reduced motion off in full mode regardless of the system signal", () => {
    expect(prefersReducedMotion("full", true)).toBe(false);
    expect(prefersReducedMotion("full", false)).toBe(false);
  });

  it("forces reduced motion on in reduced mode regardless of the system signal", () => {
    expect(prefersReducedMotion("reduced", false)).toBe(true);
    expect(prefersReducedMotion("reduced", true)).toBe(true);
  });
});
