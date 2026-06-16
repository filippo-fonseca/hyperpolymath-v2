import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/headers so getHashedIp() can read x-forwarded-for without a request.
const headersSpy = vi.fn(async () => ({
  get: (k: string) => (k === "x-forwarded-for" ? "203.0.113.7" : null),
}));
vi.mock("next/headers", () => ({
  headers: () => headersSpy(),
}));

// Mock the Drizzle db. The action chains:
//   db.insert(table).values(payload).onConflictDoNothing({ target })
//   db.insert(table).values(payload).onConflictDoUpdate({ target, set })
// Capture the values + which conflict branch was taken.
const valuesSpy = vi.fn();
const onConflictDoNothingSpy = vi.fn(async () => undefined);
const onConflictDoUpdateSpy = vi.fn(async () => undefined);
let insertShouldThrow = false;

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: (payload: unknown) => {
        valuesSpy(payload);
        if (insertShouldThrow) {
          return {
            onConflictDoNothing: async () => {
              throw new Error("connection refused");
            },
            onConflictDoUpdate: async () => {
              throw new Error("connection refused");
            },
          };
        }
        return {
          onConflictDoNothing: onConflictDoNothingSpy,
          onConflictDoUpdate: onConflictDoUpdateSpy,
        };
      },
    }),
  },
}));

// schema is imported by the action for the conflict target; stub it.
vi.mock("@/lib/db/schema", () => ({
  waitlist: { email: "waitlist.email", note: "waitlist.note" },
}));

// Import AFTER mocks are registered.
import { joinWaitlist } from "@/app/actions/waitlist";

describe("waitlist Server Action — issue #7 smoke", () => {
  beforeEach(() => {
    valuesSpy.mockClear();
    onConflictDoNothingSpy.mockClear();
    onConflictDoUpdateSpy.mockClear();
    headersSpy.mockClear();
    insertShouldThrow = false;
  });

  it("inserts a row and reports success for a valid email (happy path)", async () => {
    const result = await joinWaitlist({ email: "Me@Example.com", website: "" });
    expect(result).toEqual({ success: true });
    // Email is normalized (trim + lowercase) before insert.
    expect(valuesSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      email: "me@example.com",
    });
    // No note on first submit → idempotent do-nothing branch.
    expect(onConflictDoNothingSpy).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdateSpy).not.toHaveBeenCalled();
  });

  it("is idempotent for a duplicate email (still success, no error)", async () => {
    // onConflictDoNothing resolves whether or not a row already exists, so a
    // duplicate submit must surface as success without leaking existence.
    const result = await joinWaitlist({ email: "dupe@example.com" });
    expect(result).toEqual({ success: true });
    expect(onConflictDoNothingSpy).toHaveBeenCalledTimes(1);
  });

  it("persists the follow-up note via upsert (does not silently drop it)", async () => {
    const result = await joinWaitlist({
      email: "noter@example.com",
      note: "i build things",
    });
    expect(result).toEqual({ success: true });
    // A note must take the upsert branch so a pre-existing email row keeps it.
    expect(onConflictDoUpdateSpy).toHaveBeenCalledTimes(1);
    expect(onConflictDoNothingSpy).not.toHaveBeenCalled();
    expect(valuesSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      note: "i build things",
    });
  });

  it("treats a tripped honeypot as a silent success without inserting", async () => {
    const result = await joinWaitlist({
      email: "bot@spam.com",
      website: "http://spam.example",
    });
    expect(result).toEqual({ success: true });
    expect(valuesSpy).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with an error result", async () => {
    const result = await joinWaitlist({ email: "not-an-email" });
    expect(result).toEqual({ success: false, error: "Invalid email." });
    expect(valuesSpy).not.toHaveBeenCalled();
  });

  it("returns a friendly error (not a throw) when the insert fails", async () => {
    insertShouldThrow = true;
    const result = await joinWaitlist({ email: "boom@example.com" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/try again/i);
    }
  });
});
