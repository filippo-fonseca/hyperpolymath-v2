import { describe, it, expect } from "vitest";
import { decideLandingRoute } from "@/lib/auth/routing";

describe("onboarding routing decision", () => {
  it("first-run user (onboarded_at IS NULL) lands on /onboarding", () => {
    expect(decideLandingRoute({ onboardedAt: null })).toBe("/onboarding");
  });

  it("returning user (onboarded_at set) lands on /today", () => {
    expect(decideLandingRoute({ onboardedAt: new Date() })).toBe("/today");
  });

  it("future onboarded_at still counts as onboarded", () => {
    expect(decideLandingRoute({ onboardedAt: new Date("2099-01-01") })).toBe("/today");
  });
});
