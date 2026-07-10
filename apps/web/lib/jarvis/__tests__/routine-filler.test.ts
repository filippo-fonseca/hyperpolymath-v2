/**
 * routine-filler — opener / per-block filler greeting matches LOCAL time-of-day.
 *
 * Bug (bgsd/briefing-opener-greeting): the instant opener + per-block fillers
 * are cheap Haiku prose calls that BYPASS run-turn's greeting contract + guard,
 * so at 2:26 PM the opener free-styled "Good evening, sir." instead of "Good
 * afternoon". The fix gives `generateBlockFillerLine` timezone awareness: it
 * injects the local time-of-day + matching greeting into the system prompt AND
 * applies `correctLeadingGreeting` as a deterministic belt-and-braces guard.
 *
 * We mock `@/lib/jarvis/anthropic-client` at the module boundary (per CLAUDE.md
 * — never the raw SDK) so no Anthropic/network is touched, control the model's
 * returned text, and capture the system prompt. Fake timers pin a known instant
 * so the tz→time-of-day derivation is deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- anthropic-client mock -------------------------------------------------
let mockReturnText = "";
let lastCreateArgs: Record<string, unknown> | null = null;

const messagesCreateMock = vi.fn(async (args: Record<string, unknown>) => {
  lastCreateArgs = args;
  return { content: [{ type: "text", text: mockReturnText }] };
});

vi.mock("@/lib/jarvis/anthropic-client", () => ({
  getAnthropicClient: () => ({ messages: { create: messagesCreateMock } }),
  HAIKU_MODEL: "claude-haiku-test",
}));

import { fillerTimeContext, generateBlockFillerLine } from "@/lib/jarvis/routine-filler";

const NY = "America/New_York";

// 2026-07-07T18:26:00Z → 14:26 EDT (the bug's 2:26 PM) → afternoon.
const AFTERNOON_INSTANT = new Date("2026-07-07T18:26:00Z");
// 2026-07-07T13:00:00Z → 09:00 EDT → morning.
const MORNING_INSTANT = new Date("2026-07-07T13:00:00Z");

beforeEach(() => {
  messagesCreateMock.mockClear();
  mockReturnText = "";
  lastCreateArgs = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fillerTimeContext — tz → time-of-day derivation", () => {
  it("derives afternoon + 'Good afternoon' at 2:26 PM New York", () => {
    vi.setSystemTime(AFTERNOON_INSTANT);
    const ctx = fillerTimeContext(NY);
    expect(ctx.timeOfDay).toBe("afternoon");
    expect(ctx.greeting).toBe("Good afternoon");
    expect(ctx.clock).toBe("2:26 PM");
  });

  it("derives morning + 'Good morning' at 9:00 AM New York", () => {
    vi.setSystemTime(MORNING_INSTANT);
    const ctx = fillerTimeContext(NY);
    expect(ctx.timeOfDay).toBe("morning");
    expect(ctx.greeting).toBe("Good morning");
  });
});

describe("generateBlockFillerLine — greeting matches local time-of-day", () => {
  it("corrects a contradicting LEADING 'Good evening' to 'Good afternoon' at 2:26 PM", async () => {
    vi.setSystemTime(AFTERNOON_INSTANT);
    // The model slips and free-styles the wrong part of day (the original bug).
    mockReturnText = "Good evening, sir. I am retrieving your briefing at present.";

    const line = await generateBlockFillerLine({
      apiKey: "sk-test",
      loadingInstruction: "let them know the briefing is being retrieved",
      tool: "routine",
      routineName: "Morning Brief",
      timezone: NY,
    });

    expect(line).not.toBeNull();
    expect(line!.startsWith("Good afternoon")).toBe(true);
    expect(line).not.toMatch(/^good (evening|morning|night)/i);
    // The greeting contract was injected into the system prompt.
    expect(String(lastCreateArgs!.system)).toContain("Good afternoon");
    expect(String(lastCreateArgs!.system)).toContain("the afternoon");
  });

  it("corrects a contradicting 'Good evening' to 'Good morning' at 9:00 AM", async () => {
    vi.setSystemTime(MORNING_INSTANT);
    mockReturnText = "Good evening, sir — fetching that now.";

    const line = await generateBlockFillerLine({
      apiKey: "sk-test",
      loadingInstruction: "say we are fetching",
      tool: "routine",
      routineName: "Brief",
      timezone: NY,
    });

    expect(line!.startsWith("Good morning")).toBe(true);
  });

  it("leaves a non-greeting opener untouched", async () => {
    vi.setSystemTime(AFTERNOON_INSTANT);
    mockReturnText = "Retrieving your briefing, sir.";

    const line = await generateBlockFillerLine({
      apiKey: "sk-test",
      loadingInstruction: "say we are fetching",
      tool: "routine",
      routineName: "Brief",
      timezone: NY,
    });

    expect(line).toBe("Retrieving your briefing, sir.");
  });

  it("without a timezone: no greeting contract injected and output is unchanged", async () => {
    vi.setSystemTime(AFTERNOON_INSTANT);
    mockReturnText = "Good evening, sir. Fetching now.";

    const line = await generateBlockFillerLine({
      apiKey: "sk-test",
      loadingInstruction: "say we are fetching",
      tool: "routine",
      routineName: "Brief",
    });

    // Behavior-neutral: no tz means no guard and no injected contract.
    expect(line).toBe("Good evening, sir. Fetching now.");
    expect(String(lastCreateArgs!.system)).not.toContain("If (and only if) you open");
  });
});
