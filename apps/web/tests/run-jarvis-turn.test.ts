/**
 * runJarvisTurnStream — unit tests.
 *
 * Verifies:
 *   1. onTextDelta fires for text blocks.
 *   2. onAction fires with executor result for create_capture.
 *   3. onDone fires with usage after finalMessage.
 *   4. onQueued fires before onAction (queued placeholder timing).
 *   5. onClarification fires before onAction for ask_clarification.
 *   6. parsedPriority override sets priority on create_task result.
 *   7. onError fires when Anthropic throws a non-AbortError.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  anthropicStreamMock,
  executorCreateCaptureMock,
  executorCreateTaskMock,
  executorAskClarificationMock,
  logJarvisEventMock,
  dbState,
} = vi.hoisted(() => ({
  anthropicStreamMock: vi.fn(),
  executorCreateCaptureMock: vi.fn(),
  executorCreateTaskMock: vi.fn(),
  executorAskClarificationMock: vi.fn(),
  logJarvisEventMock: vi.fn(async () => undefined),
  dbState: { selectReturns: [] as unknown[][] },
}));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { stream: anthropicStreamMock };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

vi.mock("@/lib/db", () => {
  function makeChain(rows: unknown[]) {
    const c: Record<string, unknown> = {};
    c.from = vi.fn().mockReturnValue(c);
    c.where = vi.fn().mockReturnValue(c);
    c.orderBy = vi.fn().mockReturnValue(c);
    c.limit = vi.fn().mockResolvedValue(rows);
    (c as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return c;
  }
  return {
    db: {
      select: vi.fn(() => {
        const rows = dbState.selectReturns.shift() ?? [];
        return makeChain(rows);
      }),
      insert: vi.fn(() => ({ values: vi.fn() })),
    },
  };
});

vi.mock("@/lib/jarvis/log-event", () => ({
  logJarvisEvent: logJarvisEventMock,
}));

vi.mock("@/lib/jarvis/executor", () => ({
  createServerExecutor: () => ({
    createCapture: executorCreateCaptureMock,
    createTask: executorCreateTaskMock,
    createEvent: vi.fn(async () => ({ ok: true, id: "evt_1", receipt: {} })),
    rememberFact: vi.fn(async () => ({ ok: true, id: "fact:test", receipt: {} })),
    askClarification: executorAskClarificationMock,
  }),
}));

vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: vi.fn(async () => []),
}));

vi.mock("@/lib/jarvis/validate-references", () => ({
  validateTurnReferences: vi.fn(async () => ({ projects: { ids: [] }, hashtags: [] })),
  validateProjectIds: vi.fn(async () => ({ ok: true, ids: [], rejected: [] })),
  validateCalendarId: vi.fn(async () => ({ ok: true, calendarId: null })),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function mockDbRows() {
  dbState.selectReturns = [
    [{ id: "p1", name: "Test Project", icon: null, areaId: null, startDate: null, archivedAt: null }],
    [{ timezone: "America/New_York", defaultCalendarId: null, stateVersion: 1n }],
    [],
    [],
    [],
    [],
  ];
}

interface MockBlock {
  type: "tool_use" | "text";
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
}

function buildStream(blocks: MockBlock[], usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }) {
  const handlers: Record<string, Array<(arg: unknown) => void | Promise<void>>> = {};
  return {
    on(event: string, cb: (arg: unknown) => void | Promise<void>) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
      return this;
    },
    async finalMessage() {
      for (const block of blocks) {
        if (block.type === "tool_use") {
          for (const h of handlers.contentBlock ?? []) {
            await h({ type: "tool_use", id: block.id ?? "tu_1", name: block.name, input: block.input });
          }
        } else {
          for (const h of handlers.text ?? []) {
            await h(block.text ?? "");
          }
        }
      }
      return { id: "msg_1", content: [], usage };
    },
  };
}

describe("runJarvisTurnStream", () => {
  beforeEach(() => {
    executorCreateCaptureMock.mockResolvedValue({
      ok: true,
      id: "cap_1",
      receipt: { id: "cap_1", content: "test capture", hashtags: [], project_ids: [] },
    });
    executorCreateTaskMock.mockResolvedValue({
      ok: true,
      id: "task_1",
      receipt: { id: "task_1", title: "test task", priority: "P1", due: null },
    });
    executorAskClarificationMock.mockResolvedValue({
      ok: true,
      id: "clarification:test",
      receipt: { question: "Which project?", options: [], suggested_action: null },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fires onTextDelta for text blocks", async () => {
    mockDbRows();
    anthropicStreamMock.mockReturnValue(buildStream([{ type: "text", text: "Hello, sir." }]));

    const deltas: string[] = [];
    await runJarvisTurnStream({
      userId: USER_ID,
      apiKey: "sk-ant-test",
      input: "hello",
      isVoice: true,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: (d) => deltas.push(d),
      onAction: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(deltas).toEqual(["Hello, sir."]);
  });

  it("fires onAction with executor result for create_capture", async () => {
    mockDbRows();
    anthropicStreamMock.mockReturnValue(
      buildStream([{ type: "tool_use", id: "tu_cap", name: "create_capture", input: { content: "note about X" } }]),
    );

    const actions: Array<{ toolUseId: string; name: string; result: unknown }> = [];
    await runJarvisTurnStream({
      userId: USER_ID,
      apiKey: "sk-ant-test",
      input: "capture note about X",
      isVoice: true,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onAction: (toolUseId, name, result) => actions.push({ toolUseId, name, result }),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]!.name).toBe("create_capture");
    expect((actions[0]!.result as { ok: boolean }).ok).toBe(true);
  });

  it("fires onDone with usage after finalMessage", async () => {
    mockDbRows();
    const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 0 };
    anthropicStreamMock.mockReturnValue(buildStream([{ type: "text", text: "Done." }], usage));

    let receivedUsage: unknown;
    await runJarvisTurnStream({
      userId: USER_ID,
      apiKey: "sk-ant-test",
      input: "test",
      isVoice: true,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onAction: vi.fn(),
      onDone: (u) => { receivedUsage = u; },
      onError: vi.fn(),
    });

    expect(receivedUsage).toMatchObject({ input_tokens: 100, output_tokens: 50 });
  });

  it("fires onQueued before onAction", async () => {
    mockDbRows();
    anthropicStreamMock.mockReturnValue(
      buildStream([{ type: "tool_use", id: "tu_q", name: "create_capture", input: { content: "queued test" } }]),
    );

    const order: string[] = [];
    await runJarvisTurnStream({
      userId: USER_ID,
      apiKey: "sk-ant-test",
      input: "capture queued test",
      isVoice: true,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onQueued: () => order.push("queued"),
      onAction: () => order.push("action"),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(order).toEqual(["queued", "action"]);
  });

  it("fires onClarification for ask_clarification before onAction", async () => {
    mockDbRows();
    anthropicStreamMock.mockReturnValue(
      buildStream([
        {
          type: "tool_use",
          id: "tu_clar",
          name: "ask_clarification",
          input: { question: "Which project?", options: ["A", "B"] },
        },
      ]),
    );

    const clarifications: Array<{ question: string; options: string[] }> = [];
    const actions: string[] = [];
    await runJarvisTurnStream({
      userId: USER_ID,
      apiKey: "sk-ant-test",
      input: "do something",
      isVoice: true,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onClarification: (_id, question, options) => clarifications.push({ question, options }),
      onAction: (_, name) => actions.push(name),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(clarifications).toHaveLength(1);
    expect(clarifications[0]!.question).toBe("Which project?");
    expect(actions).toContain("ask_clarification");
  });

  it("applies parsedPriority override to create_task", async () => {
    mockDbRows();
    anthropicStreamMock.mockReturnValue(
      buildStream([
        { type: "tool_use", id: "tu_t", name: "create_task", input: { title: "buy milk", priority: "P3" } },
      ]),
    );

    await runJarvisTurnStream({
      userId: USER_ID,
      apiKey: "sk-ant-test",
      input: "buy milk P1",
      isVoice: false,
      sttDoneAt: null,
      vadEndAt: undefined,
      parsedPriority: "P1",
      onTextDelta: vi.fn(),
      onAction: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(executorCreateTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "P1" }),
      expect.anything(),
    );
  });

  it("fires onError when Anthropic throws a non-AbortError", async () => {
    mockDbRows();
    const stream = buildStream([]);
    const origFinal = stream.finalMessage;
    stream.finalMessage = async function () {
      void origFinal;
      throw new Error("Anthropic API failed");
    };
    anthropicStreamMock.mockReturnValue(stream);

    const errors: string[] = [];
    await runJarvisTurnStream({
      userId: USER_ID,
      apiKey: "sk-ant-test",
      input: "test",
      isVoice: true,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onAction: vi.fn(),
      onDone: vi.fn(),
      onError: (msg) => errors.push(msg),
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Anthropic API failed");
  });
});
