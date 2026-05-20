/**
 * Phase 7 Plan 07-04 — VOICE_ADDENDUM snapshot test.
 *
 * Guards the butler-register voice_summary guidance added to personality.ts.
 * CRITICAL_PHASE7_CONCERNS #8 enforcement: this test ONLY checks the VOICE_ADDENDUM
 * export. The existing JARVIS_PERSONALITY and TOOL_USE_RULES constants are not
 * tested here (they have their own test coverage in jarvis-prose-first.test.tsx).
 *
 * 5 assertions:
 *   1. voice_summary field referenced explicitly
 *   2. Butler-register signal phrasing (Paul-Bettany-JARVIS canon)
 *   3. All 3 create tool calibration examples present
 *   4. ≤20-word cap explicitly stated
 *   5. Forbidden output categories (IDs, hashtags, technical details) referenced
 */

import { describe, it, expect } from "vitest";
import { VOICE_ADDENDUM } from "@hyperpolymath/jarvis-core";

describe("VOICE_ADDENDUM (Phase 7 butler-register)", () => {
  it("references voice_summary field explicitly", () => {
    expect(VOICE_ADDENDUM).toMatch(/voice_summary/);
  });

  it("uses butler-register signal phrasing", () => {
    // At least one of: "butler", "Paul Bettany", "sir.", "Noted."
    expect(VOICE_ADDENDUM).toMatch(/butler|Paul Bettany|sir\.|Noted/);
  });

  it("includes calibration examples for all 3 create tools", () => {
    expect(VOICE_ADDENDUM).toMatch(/create_task/);
    expect(VOICE_ADDENDUM).toMatch(/create_capture/);
    expect(VOICE_ADDENDUM).toMatch(/create_event/);
  });

  it("enforces ≤20-word cap explicitly", () => {
    expect(VOICE_ADDENDUM).toMatch(/20 words|twenty words|≤\s*20/);
  });

  it("forbids reading out IDs / hashtags / technical details", () => {
    expect(VOICE_ADDENDUM).toMatch(/ID|hashtag|technical/);
  });
});
