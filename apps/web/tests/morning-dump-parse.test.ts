/**
 * parseMorningDump — unit tests (issues #32/#33).
 *
 * Verifies the Morning Dump parse helper:
 *   1. Maps create_task / create_event / create_capture tool_use blocks into
 *      typed plan items.
 *   2. Drops tool_use blocks that fail jarvis-core schema validation (e.g. an
 *      event missing its required `end`).
 *   3. Ignores non-tool_use content blocks (plain text).
 *   4. Forwards an abort signal to the Anthropic call.
 *
 * The Anthropic client is mocked at the anthropic-client module boundary so the
 * test never touches the network or needs an API key.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@/lib/jarvis/anthropic-client", () => ({
  getAnthropicClient: () => ({ messages: { create: createMock } }),
  JARVIS_MODEL: "claude-sonnet-4-6",
}));

import { parseMorningDump } from "@/lib/jarvis/morning-dump";

const TEMPORAL = "CURRENT USER TIME:\n- Local now: 2026-06-16T08:00 (Tue)";

beforeEach(() => {
  createMock.mockReset();
});

describe("parseMorningDump", () => {
  it("maps valid task / event / capture tool_use blocks into a plan", async () => {
    createMock.mockResolvedValue({
      content: [
        { type: "text", text: "Here is your day, sir." },
        {
          type: "tool_use",
          name: "create_task",
          input: { title: "Finish lit review", priority: "P1" },
        },
        {
          type: "tool_use",
          name: "create_event",
          input: {
            title: "Lunch with Brian",
            start: "2026-06-16T12:00:00-04:00",
            end: "2026-06-16T13:00:00-04:00",
          },
        },
        {
          type: "tool_use",
          name: "create_capture",
          input: { content: "think about the talk next week" },
        },
      ],
    });

    const plan = await parseMorningDump({ dump: "...", temporalContext: TEMPORAL });

    expect(plan.items).toHaveLength(3);
    expect(plan.items[0]).toEqual({
      kind: "task",
      input: { title: "Finish lit review", priority: "P1" },
    });
    expect(plan.items[1]?.kind).toBe("event");
    expect(plan.items[2]).toEqual({
      kind: "capture",
      input: { content: "think about the talk next week" },
    });
  });

  it("drops tool_use blocks that fail schema validation", async () => {
    createMock.mockResolvedValue({
      content: [
        // Missing required `end` — invalid event, must be dropped.
        {
          type: "tool_use",
          name: "create_event",
          input: { title: "Standup", start: "2026-06-16T09:00:00-04:00" },
        },
        // Empty title — invalid task, must be dropped.
        { type: "tool_use", name: "create_task", input: { title: "" } },
        // Valid capture — must survive.
        { type: "tool_use", name: "create_capture", input: { content: "ok" } },
      ],
    });

    const plan = await parseMorningDump({ dump: "...", temporalContext: TEMPORAL });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toEqual({ kind: "capture", input: { content: "ok" } });
  });

  it("returns an empty plan when the model emits no tool calls", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "I could not find anything to plan." }],
    });

    const plan = await parseMorningDump({ dump: "...", temporalContext: TEMPORAL });
    expect(plan.items).toEqual([]);
  });

  it("forwards an abort signal to the Anthropic call", async () => {
    createMock.mockResolvedValue({ content: [] });
    const controller = new AbortController();

    await parseMorningDump({
      dump: "...",
      temporalContext: TEMPORAL,
      abortSignal: controller.signal,
    });

    expect(createMock).toHaveBeenCalledOnce();
    const secondArg = createMock.mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(secondArg.signal).toBe(controller.signal);
  });
});
