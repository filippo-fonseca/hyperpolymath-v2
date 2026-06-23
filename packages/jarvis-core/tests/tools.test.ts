// TEST-03 + D-08 + D-09 — Zod tool schemas + buildToolDefinitions.

import { describe, expect, it } from "vitest";
import {
  buildToolDefinitions,
  zCreateCapture,
  zCreateEvent,
  zCreateTask,
} from "../src/tools";

describe("zCreateTask", () => {
  it("accepts minimal { title }", () => {
    expect(zCreateTask.safeParse({ title: "pick up groceries" }).success).toBe(true);
  });

  it("accepts full shape", () => {
    expect(
      zCreateTask.safeParse({
        title: "pick up groceries",
        priority: "P1",
        status: "up next",
        due: "2026-05-15T00:00:00.000Z",
        project_ids: ["123e4567-e89b-42d3-a456-426614174000"],
      }).success,
    ).toBe(true);
  });

  it("rejects missing title", () => {
    expect(zCreateTask.safeParse({}).success).toBe(false);
  });

  it("rejects invalid priority literal", () => {
    expect(zCreateTask.safeParse({ title: "ok", priority: "URGENT" }).success).toBe(false);
  });

  it("rejects invalid status literal (must use SPACE-separated DB enum)", () => {
    expect(zCreateTask.safeParse({ title: "ok", status: "in_progress" }).success).toBe(false);
    expect(zCreateTask.safeParse({ title: "ok", status: "in progress" }).success).toBe(true);
  });

  it("accepts P∞", () => {
    expect(zCreateTask.safeParse({ title: "ok", priority: "P∞" }).success).toBe(true);
  });

  it("accepts 'lesno' status literal (HANDOFF non-negotiable)", () => {
    expect(zCreateTask.safeParse({ title: "ok", status: "lesno" }).success).toBe(true);
  });
});

describe("zCreateCapture", () => {
  it("accepts minimal { content }", () => {
    expect(zCreateCapture.safeParse({ content: "random thought" }).success).toBe(true);
  });

  it("accepts full shape", () => {
    expect(
      zCreateCapture.safeParse({
        content: "x",
        hashtags: ["idea"],
        project_ids: ["123e4567-e89b-42d3-a456-426614174000"],
      }).success,
    ).toBe(true);
  });

  it("rejects missing content", () => {
    expect(zCreateCapture.safeParse({}).success).toBe(false);
  });
});

describe("zCreateEvent", () => {
  it("accepts minimal { title, start, end }", () => {
    expect(
      zCreateEvent.safeParse({
        title: "dinner",
        start: "2026-05-15T00:00:00.000Z",
        end: "2026-05-15T01:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts full shape", () => {
    expect(
      zCreateEvent.safeParse({
        title: "dinner",
        calendar_id: "primary",
        start: "2026-05-15T00:00:00.000Z",
        end: "2026-05-15T01:00:00.000Z",
        description: "with mark",
      }).success,
    ).toBe(true);
  });

  it("rejects missing start", () => {
    expect(
      zCreateEvent.safeParse({
        title: "dinner",
        end: "2026-05-15T01:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects missing end", () => {
    expect(
      zCreateEvent.safeParse({
        title: "dinner",
        start: "2026-05-15T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("buildToolDefinitions", () => {
  it("returns seventeen tools in order: 5 originals, update/delete/find (Phase 16), then people (Phase D)", () => {
    const tools = buildToolDefinitions();
    expect(tools.map((t) => t.name)).toEqual([
      "create_task",
      "create_capture",
      "create_event",
      "remember_fact",
      "ask_clarification",
      "update_task",
      "update_capture",
      "update_event",
      "delete_task",
      "delete_capture",
      "delete_event",
      "find_tasks",
      "find_captures",
      "find_events",
      "create_person",
      "find_people",
      "link_people",
    ]);
  });

  it("strict split: creates/deletes/meta strict, update/find non-strict (grammar budget)", () => {
    const tools = buildToolDefinitions();
    const STRICT = ["create_task", "create_capture", "create_event", "remember_fact", "ask_clarification", "delete_task", "delete_capture", "delete_event"];
    for (const t of tools) {
      expect(t.strict, t.name).toBe(STRICT.includes(t.name));
    }
  });

  it("cache_control: ephemeral with 1h TTL is set ONLY on the last tool (link_people since Phase D)", () => {
    // Phase 11 / CACHE-01 (D-06 BREAKPOINT 1): 1h TTL on the LAST tool.
    // Phase 16 moved the breakpoint to find_events; Phase D moved it to link_people (new last tool).
    const tools = buildToolDefinitions();
    const cached = tools.filter((t) => t.cache_control);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.name).toBe("link_people");
    expect(cached[0]?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    const askClarification = tools.find((t) => t.name === "ask_clarification");
    expect(askClarification?.cache_control).toBeUndefined();
  });

  it("each tool's input_schema has additionalProperties: false (strict mode requirement)", () => {
    const tools = buildToolDefinitions();
    for (const t of tools) {
      expect((t.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });

  it("voiceActive=false (default): no voice_summary property in any schema", () => {
    // Note: tool DESCRIPTIONS may mention voice_summary; only schema properties matter.
    const tools = buildToolDefinitions();
    for (const t of tools) {
      const props = (t.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(props).not.toHaveProperty("voice_summary");
    }
  });

  it("voiceActive=true: create_task / create_capture / create_event include optional voice_summary", () => {
    // remember_fact intentionally does NOT include voice_summary (it's metadata, not content)
    const tools = buildToolDefinitions({ voiceActive: true });
    const actionTools = tools.filter((t) =>
      ["create_task", "create_capture", "create_event"].includes(t.name),
    );
    for (const t of actionTools) {
      const props = (t.input_schema as { properties: Record<string, unknown> }).properties;
      expect(props).toHaveProperty("voice_summary");
    }
  });

  it("voiceActive=true: voice_summary appears in required (strict tool use lists every property)", () => {
    // Anthropic strict mode requires every property to appear in `required`;
    // semantic optionality is conveyed in the field description, not the schema.
    const tools = buildToolDefinitions({ voiceActive: true });
    const actionTools = tools.filter((t) =>
      ["create_task", "create_capture", "create_event"].includes(t.name),
    );
    for (const t of actionTools) {
      const required = ((t.input_schema as { required?: string[] }).required ?? []) as string[];
      expect(required).toContain("voice_summary");
    }
  });

  it("remember_fact schema rejects unknown type via strict enum", () => {
    // Verify the compiled JSON schema retains the enum constraint
    const tools = buildToolDefinitions();
    const factTool = tools.find((t) => t.name === "remember_fact")!;
    const schema = factTool.input_schema as {
      properties: { type: { enum?: string[] } };
    };
    expect(schema.properties.type.enum).toEqual(["preference", "rule", "entity", "workflow"]);
  });
});
