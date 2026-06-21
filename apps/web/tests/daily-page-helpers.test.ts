/**
 * Daily Page pure helpers (Phase 30) — date->title formatting + date validation.
 * Framework-free, no DB. Pins the title shape the calendar/editor depend on.
 */

import { describe, expect, it } from "vitest";

import { dailyPageTitle, isValidDailyDate } from "@/lib/pages/daily-page";

describe("dailyPageTitle", () => {
  it("formats a yyyy-MM-dd date as 'Weekday, Month D, YYYY'", () => {
    expect(dailyPageTitle("2026-06-21")).toBe("Sunday, June 21, 2026");
    expect(dailyPageTitle("2026-01-01")).toBe("Thursday, January 1, 2026");
    expect(dailyPageTitle("2025-12-31")).toBe("Wednesday, December 31, 2025");
  });

  it("treats the date as a local calendar day (no timezone day-shift)", () => {
    // The day-of-month must match the input regardless of the runner's TZ.
    expect(dailyPageTitle("2026-03-15")).toContain("March 15, 2026");
  });
});

describe("isValidDailyDate", () => {
  it("accepts well-formed yyyy-MM-dd dates", () => {
    expect(isValidDailyDate("2026-06-21")).toBe(true);
    expect(isValidDailyDate("2000-02-29")).toBe(true); // leap day
  });

  it("rejects wrong formats and non-dates", () => {
    expect(isValidDailyDate("06/21/2026")).toBe(false);
    expect(isValidDailyDate("2026-6-1")).toBe(false);
    expect(isValidDailyDate("not-a-date")).toBe(false);
    expect(isValidDailyDate("")).toBe(false);
    expect(isValidDailyDate("2026-13-40")).toBe(false);
  });
});
