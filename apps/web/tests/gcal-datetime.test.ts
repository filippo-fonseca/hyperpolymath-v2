/**
 * DST + IANA timezone fixtures for the gcal datetime helpers.
 * Phase 4 Plan 04-01 (CAL-08): spring-forward + fall-back math in
 * America/New_York for the two 2026 boundaries.
 *
 * Why pin these in tests:
 *   - DST is the canonical "obvious" bug that ships silently because the dev
 *     ran the suite in summer. Pinning Mar 8 + Nov 1 means a regression in
 *     `@date-fns/tz` (or in the gcalIsoToTZDate / tzWallClockToGcalIso helper)
 *     surfaces in CI before it surfaces as "my 10am meeting moved to 11am".
 *   - The 2026 boundary dates are what the calendar will actually render in
 *     the year of Phase 4 shipping — testing against an arbitrary "DST happens
 *     at 2am" abstraction would let an off-by-one slip past.
 *
 * Source: RESEARCH §Code Examples Pattern 5 (verbatim except the import path).
 */

import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { addHours, format } from "date-fns";
import {
  detectBrowserTimezone,
  gcalIsoToTZDate,
  tzWallClockToGcalIso,
} from "@/lib/gcal/datetime";

describe("DST spring-forward — America/New_York March 8 2026 02:00 -> 03:00", () => {
  const TZ = "America/New_York";

  it("renders a 10:00 AM EDT event AT 10:00 in the user's tz post-transition", () => {
    // March 8 2026 10:00 AM in NY is 14:00 UTC (EDT = UTC-4)
    const gcalIso = "2026-03-08T14:00:00Z";
    const tzDate = gcalIsoToTZDate(gcalIso, TZ);
    expect(format(tzDate, "yyyy-MM-dd HH:mm")).toBe("2026-03-08 10:00");
  });

  it("renders a 01:00 AM EST event AT 01:00 in the user's tz pre-transition", () => {
    // March 8 2026 01:00 AM in NY is 06:00 UTC (still EST = UTC-5)
    const gcalIso = "2026-03-08T06:00:00Z";
    const tzDate = gcalIsoToTZDate(gcalIso, TZ);
    expect(format(tzDate, "yyyy-MM-dd HH:mm")).toBe("2026-03-08 01:00");
  });

  it("adding 1 hour at the boundary skips the nonexistent 02:00 hour", () => {
    // 01:30 EST + 1h crosses the spring-forward jump → wall clock reads 03:30.
    // Month is 0-indexed: 2 = March.
    const start = new TZDate(2026, 2, 8, 1, 30, TZ);
    const after = addHours(start, 1);
    expect(format(after, "HH:mm")).toBe("03:30");
  });

  it("a 30-min event at 10:00 EDT ends at 10:30 EDT (not 11:30)", () => {
    const start = new TZDate(2026, 2, 8, 10, 0, TZ);
    const end = addHours(start, 0.5);
    expect(format(end, "HH:mm")).toBe("10:30");
  });
});

describe("DST fall-back — America/New_York November 1 2026 02:00 -> 01:00", () => {
  const TZ = "America/New_York";

  it("renders a 10:00 AM EST event AT 10:00 in the user's tz post-transition", () => {
    // Nov 1 2026 10:00 AM in NY is 15:00 UTC (EST = UTC-5)
    const gcalIso = "2026-11-01T15:00:00Z";
    const tzDate = gcalIsoToTZDate(gcalIso, TZ);
    expect(format(tzDate, "yyyy-MM-dd HH:mm")).toBe("2026-11-01 10:00");
  });

  it("does not collapse the repeated 01:00 hour: 00:30 EDT vs 01:30 EST render distinctly", () => {
    // 00:30 EDT = 04:30 UTC (pre-fall-back, UTC-4)
    const preTransition = gcalIsoToTZDate("2026-11-01T04:30:00Z", TZ);
    expect(format(preTransition, "HH:mm")).toBe("00:30");

    // 01:30 EST = 06:30 UTC (post-fall-back, UTC-5)
    const postTransition = gcalIsoToTZDate("2026-11-01T06:30:00Z", TZ);
    expect(format(postTransition, "HH:mm")).toBe("01:30");
  });

  it("a 10:00 AM event remains at 10:00 regardless of which side of fall-back the viewer is on", () => {
    const beforeFallBack = new TZDate(2026, 9, 25, 10, 0, TZ); // Oct 25 EDT
    const afterFallBack = new TZDate(2026, 10, 8, 10, 0, TZ); // Nov 8 EST
    expect(format(beforeFallBack, "HH:mm")).toBe("10:00");
    expect(format(afterFallBack, "HH:mm")).toBe("10:00");
  });
});

describe("Timezone auto-detect (D-08)", () => {
  it("detectBrowserTimezone returns a non-empty Region/City IANA string", () => {
    // Whatever the test runner's tz is (typically America/Los_Angeles in CI),
    // it should match the Region/City pattern. Use a permissive regex —
    // some IANA zones have multi-word cities (e.g. "America/New_York",
    // "Asia/Kuala_Lumpur") and underscores are valid.
    const tz = detectBrowserTimezone();
    expect(tz.length).toBeGreaterThan(0);
    expect(tz).toMatch(/^[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+/);
  });
});

describe("tzWallClockToGcalIso (form-input -> gcal ISO)", () => {
  it("converts an EDT wall-clock 10:00 AM Mar 8 2026 to the correct UTC ISO", () => {
    // EDT = UTC-4 → 10:00 local = 14:00 UTC
    const iso = tzWallClockToGcalIso(2026, 2, 8, 10, 0, "America/New_York");
    expect(new Date(iso).toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });

  it("converts an EST wall-clock 10:00 AM Nov 8 2026 to the correct UTC ISO", () => {
    // EST = UTC-5 → 10:00 local = 15:00 UTC
    const iso = tzWallClockToGcalIso(2026, 10, 8, 10, 0, "America/New_York");
    expect(new Date(iso).toISOString()).toBe("2026-11-08T15:00:00.000Z");
  });
});
