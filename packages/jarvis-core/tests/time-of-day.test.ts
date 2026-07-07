// bgsd/time-aware-greeting — time-of-day bucketing + greeting guard tests.
//
// Root cause under test: JARVIS greeted "Good morning, sir." at 1:35 PM. The
// greeting must reflect the CURRENT local time. These tests pin the bucket
// boundaries, the greeting phrases, and the deterministic leading-greeting
// safeguard that corrects a contradicting opener.

import { describe, expect, it } from "vitest";
import {
  correctLeadingGreeting,
  greetingForHour,
  greetingForTimeOfDay,
  timeOfDayForHour,
  type TimeOfDay,
} from "../src/time-of-day";

describe("timeOfDayForHour", () => {
  it("maps the representative bug times to the correct bucket", () => {
    // The reported bug: 1:35 PM (hour 13) must be afternoon, NOT morning.
    expect(timeOfDayForHour(13)).toBe("afternoon");
    expect(timeOfDayForHour(8)).toBe("morning");
    expect(timeOfDayForHour(19)).toBe("evening");
    expect(timeOfDayForHour(23)).toBe("night");
  });

  it("honours the bucket boundaries (inclusive start, exclusive end)", () => {
    // morning 05:00–11:59
    expect(timeOfDayForHour(5)).toBe("morning");
    expect(timeOfDayForHour(11)).toBe("morning");
    // afternoon 12:00–16:59
    expect(timeOfDayForHour(12)).toBe("afternoon");
    expect(timeOfDayForHour(16)).toBe("afternoon");
    // evening 17:00–20:59
    expect(timeOfDayForHour(17)).toBe("evening");
    expect(timeOfDayForHour(20)).toBe("evening");
    // night 21:00–04:59 (wraps midnight)
    expect(timeOfDayForHour(21)).toBe("night");
    expect(timeOfDayForHour(0)).toBe("night");
    expect(timeOfDayForHour(4)).toBe("night");
  });

  it("normalizes out-of-range / fractional hours", () => {
    expect(timeOfDayForHour(24)).toBe("night"); // midnight quirk → 0
    expect(timeOfDayForHour(13.9)).toBe("afternoon"); // floors to 13
    expect(timeOfDayForHour(-1)).toBe("night"); // wraps to 23
  });
});

describe("greetingForTimeOfDay / greetingForHour", () => {
  it("returns the literal greeting per bucket", () => {
    expect(greetingForTimeOfDay("morning")).toBe("Good morning");
    expect(greetingForTimeOfDay("afternoon")).toBe("Good afternoon");
    expect(greetingForTimeOfDay("evening")).toBe("Good evening");
    // night uses "Good evening" — "Good night" is a farewell, not an opener.
    expect(greetingForTimeOfDay("night")).toBe("Good evening");
  });

  it("greetingForHour composes bucket + phrase", () => {
    expect(greetingForHour(13)).toBe("Good afternoon");
    expect(greetingForHour(8)).toBe("Good morning");
    expect(greetingForHour(19)).toBe("Good evening");
    expect(greetingForHour(23)).toBe("Good evening");
  });
});

describe("correctLeadingGreeting", () => {
  it("rewrites a contradicting leading greeting (the 1:35 PM bug)", () => {
    expect(correctLeadingGreeting("Good morning, sir.", "afternoon")).toBe(
      "Good afternoon, sir.",
    );
  });

  it("leaves a correct greeting untouched", () => {
    expect(correctLeadingGreeting("Good afternoon, sir.", "afternoon")).toBe(
      "Good afternoon, sir.",
    );
  });

  it("preserves leading whitespace and the rest of the sentence", () => {
    expect(correctLeadingGreeting("  Good evening — three tasks.", "morning")).toBe(
      "  Good morning — three tasks.",
    );
  });

  it("is case-insensitive on the match", () => {
    expect(correctLeadingGreeting("good morning, sir.", "evening")).toBe(
      "Good evening, sir.",
    );
  });

  it("does NOT touch a non-leading greeting or non-greeting opener", () => {
    expect(correctLeadingGreeting("Welcome home, sir. Good morning.", "afternoon")).toBe(
      "Welcome home, sir. Good morning.",
    );
    expect(correctLeadingGreeting("Noted, sir. Friday.", "afternoon")).toBe(
      "Noted, sir. Friday.",
    );
  });

  it("requires a word boundary after the bucket word", () => {
    expect(correctLeadingGreeting("Good morningstar routine", "evening")).toBe(
      "Good morningstar routine",
    );
  });

  it("maps night correctly through the guard", () => {
    const tod: TimeOfDay = "night";
    expect(correctLeadingGreeting("Good morning, sir.", tod)).toBe("Good evening, sir.");
  });
});
