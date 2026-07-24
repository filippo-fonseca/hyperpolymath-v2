import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Mirrors ClearStaleIncompleteSchema in app/actions/tasks.ts */
const ClearStaleIncompleteSchema = z.object({
  olderThanDays: z.number().int().min(1).max(3650),
});

describe("clearStaleIncompleteTasks input", () => {
  it("accepts sensible day counts", () => {
    expect(ClearStaleIncompleteSchema.safeParse({ olderThanDays: 30 }).success).toBe(true);
    expect(ClearStaleIncompleteSchema.safeParse({ olderThanDays: 1 }).success).toBe(true);
  });

  it("rejects zero / negative / non-int", () => {
    expect(ClearStaleIncompleteSchema.safeParse({ olderThanDays: 0 }).success).toBe(false);
    expect(ClearStaleIncompleteSchema.safeParse({ olderThanDays: -3 }).success).toBe(false);
    expect(ClearStaleIncompleteSchema.safeParse({ olderThanDays: 1.5 }).success).toBe(false);
  });
});
