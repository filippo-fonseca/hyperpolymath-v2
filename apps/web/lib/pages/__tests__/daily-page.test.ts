import { describe, expect, it } from "vitest";
import {
  dailyDayClickAction,
  dailyPageTitle,
  isValidDailyDate,
  shouldAutoOpenToday,
  shouldEnsureTodayDailyPage,
} from "@/lib/pages/daily-page";

describe("dailyPageTitle", () => {
  it("formats a yyyy-MM-dd as its local calendar day title", () => {
    // parseISO on a bare date treats it as local midnight; the weekday must
    // match the given calendar date regardless of the runner's timezone.
    expect(dailyPageTitle("2026-07-10")).toBe("Friday, July 10, 2026");
  });
});

describe("isValidDailyDate", () => {
  it("accepts yyyy-MM-dd", () => {
    expect(isValidDailyDate("2026-01-01")).toBe(true);
    expect(isValidDailyDate("2026-12-31")).toBe(true);
  });

  it("rejects non-conforming strings", () => {
    expect(isValidDailyDate("2026-1-1")).toBe(false);
    expect(isValidDailyDate("07/10/2026")).toBe(false);
    expect(isValidDailyDate("not-a-date")).toBe(false);
    expect(isValidDailyDate("")).toBe(false);
  });
});

describe("dailyDayClickAction", () => {
  it("routes to an existing page when one exists", () => {
    const action = dailyDayClickAction("2026-07-10", "page-abc");
    expect(action).toEqual({ kind: "route", pageId: "page-abc" });
  });

  it("selects (never creates) when there is no page", () => {
    expect(dailyDayClickAction("2026-07-10", undefined)).toEqual({
      kind: "select",
    });
  });
});

describe("shouldAutoOpenToday", () => {
  it("is false until the daily-pages list is fetched", () => {
    expect(
      shouldAutoOpenToday({ dailyFetched: false, todayExists: false }),
    ).toBe(false);
  });

  it("is true when fetched and today has no page", () => {
    expect(
      shouldAutoOpenToday({ dailyFetched: true, todayExists: false }),
    ).toBe(true);
  });

  it("is false when today already exists", () => {
    expect(shouldAutoOpenToday({ dailyFetched: true, todayExists: true })).toBe(
      false,
    );
  });
});

describe("shouldEnsureTodayDailyPage", () => {
  it("only fires once fetched, when today is missing, and hasn't fired yet", () => {
    expect(
      shouldEnsureTodayDailyPage({
        dailyFetched: true,
        todayExists: false,
        hasFiredForDate: false,
      }),
    ).toBe(true);
  });

  it("no-ops before the daily-pages list has loaded", () => {
    expect(
      shouldEnsureTodayDailyPage({
        dailyFetched: false,
        todayExists: false,
        hasFiredForDate: false,
      }),
    ).toBe(false);
  });

  it("no-ops when today already exists", () => {
    expect(
      shouldEnsureTodayDailyPage({
        dailyFetched: true,
        todayExists: true,
        hasFiredForDate: false,
      }),
    ).toBe(false);
  });

  it("no-ops once already fired for this date (idempotent per mount)", () => {
    expect(
      shouldEnsureTodayDailyPage({
        dailyFetched: true,
        todayExists: false,
        hasFiredForDate: true,
      }),
    ).toBe(false);
  });
});
