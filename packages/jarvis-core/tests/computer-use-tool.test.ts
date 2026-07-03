// computer_use tool test — JSON contract guarantee for the Computer Use
// catch-all FALLBACK (mirrors computer-control-tools.test.ts patterns):
//   (a) ComputerUseInputSchema validates and rejects correctly.
//   (b) buildToolDefinitions registers computer_use non-strict, LAST, and
//       carrying the 1h cache breakpoint.
//   (c) The description is an explicit catch-all with the negative list
//       (this wording is load-bearing — it is what keeps the model from
//       reaching for computer_use when a named tool fits).
//
// The executor result shape ({ ok, action: { kind: "computer_use", task,
// session_id } }) is tested in
// apps/web/tests/jarvis-executor-computer-control.test.ts.

import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../src/tools";
import { ComputerUseInputSchema } from "../src/tools/computer-use";

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("ComputerUseInputSchema", () => {
  it("accepts a plain-language task", () => {
    expect(
      ComputerUseInputSchema.safeParse({ task: "close all my browser tabs" }).success,
    ).toBe(true);
  });

  it("rejects missing task", () => {
    expect(ComputerUseInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty task string", () => {
    expect(ComputerUseInputSchema.safeParse({ task: "" }).success).toBe(false);
  });

  it("rejects non-string task", () => {
    expect(ComputerUseInputSchema.safeParse({ task: 42 }).success).toBe(false);
  });

  it("rejects extra properties (strict object)", () => {
    expect(
      ComputerUseInputSchema.safeParse({ task: "tidy the desktop", region: "0,0,10,10" })
        .success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildToolDefinitions — registration + metadata
// ---------------------------------------------------------------------------

describe("buildToolDefinitions — computer_use fallback", () => {
  it("includes computer_use in the tool list", () => {
    const names = buildToolDefinitions().map((t) => t.name);
    expect(names).toContain("computer_use");
  });

  it("computer_use is NON-strict (grammar budget)", () => {
    const t = buildToolDefinitions().find((x) => x.name === "computer_use")!;
    expect(t.strict).toBe(false);
  });

  it("computer_use is the LAST tool and carries the 1h cache breakpoint", () => {
    const tools = buildToolDefinitions();
    expect(tools[tools.length - 1]?.name).toBe("computer_use");
    expect(tools[tools.length - 1]?.cache_control).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
  });

  it("description is an explicit catch-all with the named-tool negatives", () => {
    const t = buildToolDefinitions().find((x) => x.name === "computer_use")!;
    expect(t.description).toContain("ONLY when no other named tool");
    expect(t.description).toContain("NEVER");
    // The negative list must name the surfaces that already have tools.
    for (const covered of [
      "urls",
      "apps",
      "search",
      "volume",
      "music",
      "calendar",
      "messages",
      "screenshots",
      "typing",
      "keystrokes",
    ]) {
      expect(t.description.toLowerCase(), covered).toContain(covered);
    }
  });

  it("input_schema has required task property and additionalProperties: false", () => {
    const t = buildToolDefinitions().find((x) => x.name === "computer_use")!;
    const schema = t.input_schema as {
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
    expect(schema.properties).toHaveProperty("task");
    expect(schema.required).toContain("task");
    expect(schema.additionalProperties).toBe(false);
  });
});
