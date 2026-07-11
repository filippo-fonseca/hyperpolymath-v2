// read_imessage tool — schema + registration guarantees.
//
// The executor's result shape (grouped receipt, empty-hint fallback) is tested
// against the server executor in apps/web/tests. This suite covers the
// jarvis-core surface: the Zod schema and the tool entry in
// buildToolDefinitions.

import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../src/tools";
import { ReadImessageInputSchema } from "../src/tools/read-imessage";

describe("ReadImessageInputSchema", () => {
  it("accepts an empty input (all fields optional)", () => {
    expect(ReadImessageInputSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full input", () => {
    expect(
      ReadImessageInputSchema.safeParse({
        chat: "Mom",
        since_hours: 48,
        maxResults: 50,
        unrepliedOnly: true,
      }).success,
    ).toBe(true);
  });

  it("rejects since_hours > 168 (one-week cap)", () => {
    expect(ReadImessageInputSchema.safeParse({ since_hours: 200 }).success).toBe(false);
  });

  it("rejects maxResults > 100", () => {
    expect(ReadImessageInputSchema.safeParse({ maxResults: 500 }).success).toBe(false);
  });

  it("rejects unknown properties (strict schema)", () => {
    expect(ReadImessageInputSchema.safeParse({ nope: true }).success).toBe(false);
  });
});

describe("buildToolDefinitions — read_imessage registration", () => {
  it("registers read_imessage as non-strict before Studio controls and computer_use", () => {
    const tools = buildToolDefinitions();
    const names = tools.map((t) => t.name);
    const ri = tools.find((t) => t.name === "read_imessage");
    expect(ri).toBeDefined();
    expect(ri?.strict).toBe(false);
    expect(ri?.cache_control).toBeUndefined();
    const iWa = names.indexOf("read_whatsapp");
    const iIm = names.indexOf("read_imessage");
    const iCu = names.indexOf("computer_use");
    expect(iWa).toBeGreaterThan(-1);
    expect(iIm).toBe(iWa + 1);
    expect(names[iIm + 1]).toBe("studio_open_widget");
    expect(names[iIm + 2]).toBe("studio_close_widget");
    expect(iCu).toBe(iIm + 3);
    expect(iCu).toBe(names.length - 1);
  });
});
