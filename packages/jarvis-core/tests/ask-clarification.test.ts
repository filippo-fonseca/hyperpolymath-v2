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
        question: "When should I schedule dinner with Anna?",
        options: ["Tonight 8pm", "Tomorrow 7pm", "Saturday 8pm"],
        suggested_action: {
          tool: "create_event",
          args: { title: "Dinner with Anna" },
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

  it("rejects > 5 options (chip cap)", () => {
    expect(
      zAskClarification.safeParse({
        question: "Which?",
        options: ["A", "B", "C", "D", "E", "F"], // 6 items
      }).success,
    ).toBe(false);
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
          args: {},
        },
      }).success,
    ).toBe(false);
  });

  it("zAskClarificationFor factory produces a schema matching expected defaults", () => {
    const schema = zAskClarificationFor({ voiceActive: false });
    expect(schema.safeParse({ question: "ok?" }).success).toBe(true);
  });
});

describe("buildToolDefinitions — 5 tools after Plan 04 (D-A1)", () => {
  it("returns 5 tools in order: create_task, create_capture, create_event, remember_fact, ask_clarification", () => {
    const tools = buildToolDefinitions();
    expect(tools).toHaveLength(5);
    expect(tools[0]?.name).toBe("create_task");
    expect(tools[1]?.name).toBe("create_capture");
    expect(tools[2]?.name).toBe("create_event");
    expect(tools[3]?.name).toBe("remember_fact");
    expect(tools[4]?.name).toBe("ask_clarification");
  });

  it("cache_control: ephemeral is set ONLY on ask_clarification (new LAST tool — moved from remember_fact)", () => {
    const tools = buildToolDefinitions();
    const cached = tools.filter((t) => t.cache_control);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.name).toBe("ask_clarification");
    expect(cached[0]?.cache_control).toEqual({ type: "ephemeral" });
    // remember_fact must NOT carry cache_control anymore
    const rememberFact = tools.find((t) => t.name === "remember_fact");
    expect(rememberFact?.cache_control).toBeUndefined();
  });

  it("each tool has strict: true", () => {
    const tools = buildToolDefinitions();
    for (const t of tools) {
      expect(t.strict).toBe(true);
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
