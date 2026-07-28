import { describe, expect, it } from "vitest";
import {
  describeReminder,
  normalizeReminders,
  reminderFireAt,
  reminderOffsetMs,
  resolveDueDateTime,
  TaskRemindersSchema,
} from "@/lib/tasks/reminders";

describe("task reminders", () => {
  it("normalizes, dedupes ids, and clamps amount", () => {
    const out = normalizeReminders([
      { id: "a", amount: 0, unit: "hours" },
      { id: "a", amount: 2, unit: "hours" },
      { id: "b", amount: 90, unit: "minutes" },
    ]);
    expect(out).toEqual([
      { id: "a", amount: 1, unit: "hours" },
      { id: "b", amount: 90, unit: "minutes" },
    ]);
  });

  it("rejects more than 50 reminders via schema", () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      id: `r${i}`,
      amount: 1,
      unit: "days" as const,
    }));
    expect(TaskRemindersSchema.safeParse(many).success).toBe(false);
  });

  it("computes offset ms", () => {
    expect(reminderOffsetMs({ id: "x", amount: 2, unit: "hours" })).toBe(7_200_000);
    expect(reminderOffsetMs({ id: "x", amount: 1, unit: "weeks" })).toBe(7 * 86_400_000);
  });

  it("fires before due datetime in a timezone", () => {
    const due = resolveDueDateTime("2026-07-24", "15:00", "America/New_York");
    const fire = reminderFireAt(
      "2026-07-24",
      "15:00",
      { id: "r1", amount: 30, unit: "minutes" },
      "America/New_York",
    );
    expect(fire).not.toBeNull();
    expect(fire!.getTime()).toBe(due.getTime() - 30 * 60_000);
  });

  it("defaults null due_time to 09:00", () => {
    const withDefault = resolveDueDateTime("2026-07-24", null, "UTC");
    const explicit = resolveDueDateTime("2026-07-24", "09:00", "UTC");
    expect(withDefault.getTime()).toBe(explicit.getTime());
  });

  it("describes reminders in plain English", () => {
    expect(describeReminder({ id: "1", amount: 1, unit: "days" })).toBe(
      "1 day before due",
    );
    expect(describeReminder({ id: "1", amount: 15, unit: "minutes" })).toBe(
      "15 minutes before due",
    );
  });
});
