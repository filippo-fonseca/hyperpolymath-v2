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
    expect(zCreateTask.safeParse({ title: "buy flowers" }).success).toBe(true);
  });

  it("accepts full shape", () => {
    expect(
      zCreateTask.safeParse({
        title: "buy flowers",
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
  it("returns three tools in order: create_task, create_capture, create_event", () => {
    const tools = buildToolDefinitions();
    expect(tools).toHaveLength(3);
    expect(tools[0]?.name).toBe("create_task");
    expect(tools[1]?.name).toBe("create_capture");
    expect(tools[2]?.name).toBe("create_event");
  });

  it("each tool has strict: true (per-tool, replaces deprecated beta header)", () => {
    const tools = buildToolDefinitions();
    for (const t of tools) {
      expect(t.strict).toBe(true);
    }
  });

  it("cache_control: ephemeral is set ONLY on the last tool (create_event)", () => {
    const tools = buildToolDefinitions();
    const cached = tools.filter((t) => t.cache_control);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.name).toBe("create_event");
    expect(cached[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("each tool's input_schema has additionalProperties: false (strict mode requirement)", () => {
    const tools = buildToolDefinitions();
    for (const t of tools) {
      expect((t.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });

  it("voiceActive=false (default): no voice_summary field in any schema", () => {
    const tools = buildToolDefinitions();
    const allJson = JSON.stringify(tools);
    expect(allJson).not.toContain("voice_summary");
  });

  it("voiceActive=true: every tool schema includes optional voice_summary", () => {
    const tools = buildToolDefinitions({ voiceActive: true });
    for (const t of tools) {
      const props = (t.input_schema as { properties: Record<string, unknown> }).properties;
      expect(props).toHaveProperty("voice_summary");
    }
  });

  it("voiceActive=true: voice_summary is NOT in required (always optional)", () => {
    const tools = buildToolDefinitions({ voiceActive: true });
    for (const t of tools) {
      const required = ((t.input_schema as { required?: string[] }).required ?? []) as string[];
      expect(required).not.toContain("voice_summary");
    }
  });
});
