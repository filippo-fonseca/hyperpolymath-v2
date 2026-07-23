import { describe, expect, it } from "vitest";

import { detectStudioBackstop } from "@/lib/jarvis/studio-intent-backstop";

describe("detectStudioBackstop", () => {
  it("returns null when a widget already opened this turn", () => {
    expect(detectStudioBackstop("turn on the desk light", true)).toBeNull();
  });

  it("nudges home for smart-light control and status phrases", () => {
    expect(detectStudioBackstop("turn on the desk light", false)).toBe("home");
    expect(detectStudioBackstop("are the bedroom lights on", false)).toBe("home");
    expect(detectStudioBackstop("show my lights", false)).toBe("home");
    expect(detectStudioBackstop("what lights do I have", false)).toBe("home");
    expect(detectStudioBackstop("govee status", false)).toBe("home");
  });

  it("still prioritizes weather over home when both could match", () => {
    expect(detectStudioBackstop("what's the weather", false)).toBe("weather");
  });

  it("ignores unrelated light mentions", () => {
    expect(detectStudioBackstop("remind me to buy light bulbs tomorrow", false)).toBeNull();
  });
});
