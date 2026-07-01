// Phase 5.1 (D-A1 / JARVIS-19) — ask_clarification schema tests.
//
// TDD RED: these tests assert the shape of the 5th JARVIS tool before
// implementation. They drive: ask-clarification.ts + index.ts 5th tool +
// personality.ts "five tools" update.

import { describe, expect, it } from "vitest";
import { zAskClarification, zAskClarificationFor } from "../src/tools/ask-clarification";
import { buildToolDefinitions } from "../src/tools";

describe("zAskClarification — schema validation (D-A1 / JARVIS-19)", () => {
  it("accepts minimal { question }", () => {
    expect(
      zAskClarification.safeParse({ question: "Saturday or Sunday?" }).success,
    ).toBe(true);
  });

  it("accepts question + optional chip options", () => {
    expect(
      zAskClarification.safeParse({
        question: "Did you mean Saturday or Sunday?",
        options: ["Saturday", "Sunday"],
      }).success,
    ).toBe(true);
  });

  it("accepts full shape with suggested_action", () => {
    expect(
      zAskClarification.safeParse({
        question: "When should I schedule lunch with Sam?",
        options: ["Tonight 8pm", "Tomorrow 7pm", "Saturday 8pm"],
        suggested_action: {
          tool: "create_event",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects empty question (min 1 char)", () => {
    expect(zAskClarification.safeParse({ question: "" }).success).toBe(false);
  });

  it("rejects question > 300 chars", () => {
    expect(
      zAskClarification.safeParse({ question: "x".repeat(301) }).success,
    ).toBe(false);
  });

  it("accepts > 5 options at the Zod layer (chip cap enforced via prompt + UI truncation)", () => {
    // Array `.max()` was removed from zAskClarification because Anthropic's
    // strict tool use rejects JSON Schema `maxItems`. The ≤5 chip rule lives
    // in TOOL_USE_RULES system-prompt copy + UI-side truncation. The Zod
    // schema only enforces element shape (string, ≤80 chars).
    expect(
      zAskClarification.safeParse({
        question: "Which?",
        options: ["A", "B", "C", "D", "E", "F"], // 6 items — accepted by schema
      }).success,
    ).toBe(true);
  });

  it("rejects option > 80 chars", () => {
    expect(
      zAskClarification.safeParse({
        question: "Which?",
        options: ["x".repeat(81)],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid suggested_action tool name", () => {
    expect(
      zAskClarification.safeParse({
        question: "When?",
        suggested_action: {
          tool: "delete_task", // not allowed
        },
      }).success,
    ).toBe(false);
  });

  it("zAskClarificationFor factory produces a schema matching expected defaults", () => {
    const schema = zAskClarificationFor({ voiceActive: false });
    expect(schema.safeParse({ question: "ok?" }).success).toBe(true);
  });
});

describe("buildToolDefinitions — 20 tools after computer-control phase", () => {
  it("returns 20 tools with the 5 originals first and ask_clarification 5th", () => {
    const tools = buildToolDefinitions();
    expect(tools).toHaveLength(20);
    expect(tools[0]?.name).toBe("create_task");
    expect(tools[1]?.name).toBe("create_capture");
    expect(tools[2]?.name).toBe("create_event");
    expect(tools[3]?.name).toBe("remember_fact");
    expect(tools[4]?.name).toBe("ask_clarification");
  });

  it("cache_control: ephemeral with 1h TTL is set ONLY on web_search (last tool since computer-control)", () => {
    // Phase 11 / CACHE-01 (D-06 BREAKPOINT 1): 1h TTL on the LAST tool.
    // Phase 16 moved the breakpoint to find_events; Phase D moved it to link_people;
    // computer-control phase moved it to web_search (new last tool).
    const tools = buildToolDefinitions();
    const cached = tools.filter((t) => t.cache_control);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.name).toBe("web_search");
    expect(cached[0]?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    const askClarification = tools.find((t) => t.name === "ask_clarification");
    expect(askClarification?.cache_control).toBeUndefined();
  });

  it("strict split: creates/deletes/meta strict, update/find non-strict (grammar budget)", () => {
    const tools = buildToolDefinitions();
    const STRICT = ["create_task", "create_capture", "create_event", "remember_fact", "ask_clarification", "delete_task", "delete_capture", "delete_event"];
    for (const t of tools) {
      expect(t.strict, t.name).toBe(STRICT.includes(t.name));
    }
  });

  it("each tool's input_schema has additionalProperties: false", () => {
    const tools = buildToolDefinitions();
    for (const t of tools) {
      expect(
        (t.input_schema as { additionalProperties?: boolean })
          .additionalProperties,
      ).toBe(false);
    }
  });

  it("ask_clarification description contains co-emit prohibition ('alone')", () => {
    const tools = buildToolDefinitions();
    const clarify = tools.find((t) => t.name === "ask_clarification");
    expect(clarify?.description).toMatch(/alone/i);
  });
});
