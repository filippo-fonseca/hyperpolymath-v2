import { formatEventCountdown } from "@/lib/gcal/event-countdown";
import { describe, expect, it } from "vitest";

const NOW = Date.parse("2026-07-31T18:00:00.000Z");

function startIn(minutes: number): string {
  return new Date(NOW + minutes * 60_000).toISOString();
}

describe("formatEventCountdown", () => {
  it("returns All day for all-day events", () => {
    expect(formatEventCountdown("2026-07-31", true, NOW)).toBe("All day");
  });

  it("returns Now when the event has started", () => {
    expect(formatEventCountdown(startIn(0), false, NOW)).toBe("Now");
    expect(formatEventCountdown(startIn(-5), false, NOW)).toBe("Now");
  });

  it("keeps minute granularity under an hour", () => {
    expect(formatEventCountdown(startIn(1), false, NOW)).toBe("In 1 min");
    expect(formatEventCountdown(startIn(12), false, NOW)).toBe("In 12 min");
    expect(formatEventCountdown(startIn(59), false, NOW)).toBe("In 59 min");
  });

  it("keeps leftover minutes once past an hour (no bare rounded hour)", () => {
    expect(formatEventCountdown(startIn(60), false, NOW)).toBe("In 1 hr");
    expect(formatEventCountdown(startIn(72), false, NOW)).toBe("In 1 hr 12 min");
    expect(formatEventCountdown(startIn(125), false, NOW)).toBe("In 2 hr 5 min");
  });
});
