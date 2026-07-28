import { describe, expect, it } from "vitest";
import { computeHabitStreak, groupCompletedDates } from "./streak";

// 2026-07-28 is a Tuesday.
const TODAY = "2026-07-28";
const EVERY_DAY = [true, true, true, true, true, true, true] as const;
// Mon / Wed / Fri only.
const MWF = [false, true, false, true, false, true, false] as const;

function completedSet(...dates: string[]): Set<string> {
  return new Set(dates);
}

describe("computeHabitStreak", () => {
  it("shows 1 the moment a brand-new habit is checked on day one", () => {
    const r = computeHabitStreak({
      daysOfWeek: EVERY_DAY,
      createdAtISO: TODAY,
      completed: completedSet(TODAY),
      todayISO: TODAY,
    });
    expect(r).toEqual({ base: 0, current: 1, saturated: false });
  });

  it("forgives an unchecked today instead of zeroing the chain", () => {
    const r = computeHabitStreak({
      daysOfWeek: EVERY_DAY,
      createdAtISO: "2026-07-20",
      completed: completedSet("2026-07-26", "2026-07-27"),
      todayISO: TODAY,
    });
    expect(r.base).toBe(2);
    expect(r.current).toBe(2);
  });

  it("counts today once it is done", () => {
    const r = computeHabitStreak({
      daysOfWeek: EVERY_DAY,
      createdAtISO: "2026-07-20",
      completed: completedSet("2026-07-26", "2026-07-27", TODAY),
      todayISO: TODAY,
    });
    expect(r.current).toBe(3);
  });

  it("treats unscheduled days as transparent", () => {
    // MWF habit: Mon 7/27 done, Fri 7/24 done, Wed 7/22 done. The weekend and
    // Tue/Thu in between must not break anything. Today (Tue) is unscheduled.
    const r = computeHabitStreak({
      daysOfWeek: MWF,
      createdAtISO: "2026-07-01",
      completed: completedSet("2026-07-22", "2026-07-24", "2026-07-27"),
      todayISO: TODAY,
    });
    expect(r.base).toBe(3);
    expect(r.current).toBe(3);
  });

  it("breaks on a missed scheduled day", () => {
    // Mon 7/27 done, Fri 7/24 missed → streak is just Monday.
    const r = computeHabitStreak({
      daysOfWeek: MWF,
      createdAtISO: "2026-07-01",
      completed: completedSet("2026-07-22", "2026-07-27"),
      todayISO: TODAY,
    });
    expect(r.base).toBe(1);
  });

  it("ignores a completion logged on an unscheduled day", () => {
    // Sunday completion on an MWF habit neither counts nor breaks.
    const r = computeHabitStreak({
      daysOfWeek: MWF,
      createdAtISO: "2026-07-01",
      completed: completedSet("2026-07-26", "2026-07-27"),
      todayISO: TODAY,
    });
    expect(r.base).toBe(1);
  });

  it("gives no today-credit when today is unscheduled", () => {
    const r = computeHabitStreak({
      daysOfWeek: MWF,
      createdAtISO: "2026-07-01",
      completed: completedSet("2026-07-27", TODAY),
      todayISO: TODAY,
    });
    expect(r.current).toBe(1);
  });

  it("stops at the habit's creation date", () => {
    const r = computeHabitStreak({
      daysOfWeek: EVERY_DAY,
      createdAtISO: "2026-07-26",
      // 7/25 done but the habit didn't exist yet; must not count.
      completed: completedSet("2026-07-25", "2026-07-26", "2026-07-27"),
      todayISO: TODAY,
    });
    expect(r).toEqual({ base: 2, current: 2, saturated: false });
  });

  it("does not truncate long runs (the old 14-day cap)", () => {
    const days: string[] = [];
    for (let i = 1; i <= 40; i++) {
      const d = new Date(2026, 6, 28);
      d.setDate(d.getDate() - i);
      days.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
    const r = computeHabitStreak({
      daysOfWeek: EVERY_DAY,
      createdAtISO: "2026-01-01",
      completed: new Set(days),
      todayISO: TODAY,
    });
    expect(r.base).toBe(40);
    expect(r.saturated).toBe(false);
  });

  it("flags saturation when an unbroken run exhausts the fetched window", () => {
    const days: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const d = new Date(2026, 6, 28);
      d.setDate(d.getDate() - i);
      days.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
    const r = computeHabitStreak({
      daysOfWeek: EVERY_DAY,
      createdAtISO: "2026-01-01",
      completed: new Set(days),
      todayISO: TODAY,
      windowStartISO: "2026-07-18",
    });
    expect(r.base).toBe(10);
    expect(r.saturated).toBe(true);
  });

  it("does not flag saturation when the break lands inside the window", () => {
    const r = computeHabitStreak({
      daysOfWeek: EVERY_DAY,
      createdAtISO: "2026-01-01",
      completed: completedSet("2026-07-27"),
      todayISO: TODAY,
      windowStartISO: "2026-07-01",
    });
    expect(r).toEqual({ base: 1, current: 1, saturated: false });
  });
});

describe("groupCompletedDates", () => {
  it("groups rows into per-habit date sets", () => {
    const grouped = groupCompletedDates([
      { habitId: "a", completedDate: "2026-07-27" },
      { habitId: "a", completedDate: "2026-07-28" },
      { habitId: "b", completedDate: "2026-07-28" },
    ]);
    expect(grouped.get("a")).toEqual(new Set(["2026-07-27", "2026-07-28"]));
    expect(grouped.get("b")).toEqual(new Set(["2026-07-28"]));
    expect(grouped.get("c")).toBeUndefined();
  });
});
