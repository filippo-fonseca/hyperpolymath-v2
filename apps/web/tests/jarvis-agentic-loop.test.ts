/**
 * JARVIS agentic loop — unit tests.
 *
 * Verifies:
 *   1. find -> delete completes in one user turn (2 passes through the loop).
 *   2. Single-pass create_task terminates after 1 pass (no latency regression).
 *   3. Loop respects LOOP_CAP (5) even when model never stops tool_use.
 *   4. Session-entities scratchpad appears in system without cache_control.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted spies + state
// ---------------------------------------------------------------------------

const {
  anthropicStreamMock,
  executorFindTasksMock,
  executorDeleteTaskMock,
  executorCreateTaskMock,
  logJarvisEventMock,
  dbState,
} = vi.hoisted(() => ({
  anthropicStreamMock: vi.fn(),
  executorFindTasksMock: vi.fn(),
  executorDeleteTaskMock: vi.fn(),
  executorCreateTaskMock: vi.fn(),
  logJarvisEventMock: vi.fn(async () => undefined),
  dbState: { selectReturns: [] as unknown[][] },
}));

// --- Anthropic SDK mock ----------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { stream: anthropicStreamMock };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

// --- DB mock ---------------------------------------------------------------

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
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    },
  };
});

// --- Telemetry mock --------------------------------------------------------

vi.mock("@/lib/jarvis/log-event", () => ({
  logJarvisEvent: logJarvisEventMock,
}));

// --- Executor mock (returns canned results for find + delete) --------------

vi.mock("@/lib/jarvis/executor", () => ({
  createServerExecutor: () => ({
    findTasks: executorFindTasksMock,
    deleteTask: executorDeleteTaskMock,
    createTask: executorCreateTaskMock,
    createCapture: vi.fn(async () => ({ ok: true, id: "cap_1", receipt: {} })),
    createEvent: vi.fn(async () => ({ ok: true, id: "evt_1", receipt: {} })),
    rememberFact: vi.fn(async () => ({ ok: true, id: "fact:test", receipt: {} })),
    askClarification: vi.fn(async () => ({ ok: true, id: "clar:test", receipt: {} })),
    updateTask: vi.fn(async () => ({ ok: true, id: "task-1", receipt: {} })),
    updateCapture: vi.fn(async () => ({ ok: true, id: "cap-1", receipt: {} })),
    deleteCapture: vi.fn(async () => ({ ok: true, id: "cap-1", receipt: {} })),
    updateEvent: vi.fn(async () => ({ ok: true, id: "evt-1", receipt: {} })),
    deleteEvent: vi.fn(async () => ({ ok: true, id: "evt-1", receipt: {} })),
    findCaptures: vi.fn(async () => ({ ok: true, id: "find_captures", receipt: { matches: [] } })),
    findEvents: vi.fn(async () => ({ ok: true, id: "find_events", receipt: { matches: [] } })),
  }),
}));

// --- Facts mock ------------------------------------------------------------

vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: vi.fn(async () => []),
}));

// --- Validate references mock ----------------------------------------------

vi.mock("@/lib/jarvis/validate-references", () => ({
  validateTurnReferences: vi.fn(async () => ({ projects: { ids: [] }, hashtags: [] })),
  validateProjectIds: vi.fn(async () => ({ ok: true, ids: [], rejected: [] })),
  validateCalendarId: vi.fn(async () => ({ ok: true, calendarId: null })),
}));

process.env.ANTHROPIC_API_KEY = "test-key-agentic-loop";

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function mockDbRows() {
  dbState.selectReturns = [
    [{ id: "p1", name: "Test Project", icon: null, areaId: null, startDate: null, archivedAt: null }],
    [{ timezone: "America/New_York", defaultCalendarId: null, stateVersion: 1n, displayName: null }],
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

interface MockUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

/**
 * Build a scriptable Anthropic stream mock.
 * The `capturedParams` array receives all params objects passed to messages.stream().
 */
function buildStreamSequence(
  passes: Array<{
    blocks: MockBlock[];
    stopReason: "tool_use" | "end_turn";
    usage?: Partial<MockUsage>;
  }>,
  capturedParams?: Array<unknown>,
) {
  let callCount = 0;
  return vi.fn().mockImplementation((params: unknown) => {
    if (capturedParams) capturedParams.push(params);
    const pass = passes[callCount] ?? passes[passes.length - 1];
    callCount++;

    const handlers: Record<string, Array<(arg: unknown) => void | Promise<void>>> = {};
    return {
      on(event: string, cb: (arg: unknown) => void | Promise<void>) {
        handlers[event] = handlers[event] ?? [];
        handlers[event].push(cb);
        return this;
      },
      async finalMessage() {
        for (const block of pass.blocks) {
          if (block.type === "tool_use") {
            for (const h of handlers.contentBlock ?? []) {
              await h({
                type: "tool_use",
                id: block.id ?? `tu_${Math.random().toString(36).slice(2)}`,
                name: block.name,
                input: block.input,
              });
            }
          } else if (block.type === "text") {
            for (const h of handlers.text ?? []) {
              await h(block.text ?? "");
            }
          }
        }
        return {
          id: `msg_pass_${callCount}`,
          stop_reason: pass.stopReason,
          content: pass.blocks.map((b) =>
            b.type === "tool_use"
              ? { type: "tool_use", id: b.id ?? `tu_${callCount}`, name: b.name, input: b.input }
              : { type: "text", text: b.text ?? "" },
          ),
          usage: {
            input_tokens: pass.usage?.input_tokens ?? 100,
            output_tokens: pass.usage?.output_tokens ?? 50,
            cache_read_input_tokens: pass.usage?.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: pass.usage?.cache_creation_input_tokens ?? 0,
          },
        };
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JARVIS agentic loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executorFindTasksMock.mockResolvedValue({
      ok: true,
      id: "find_tasks",
      receipt: { matches: [{ id: "task-abc", title: "orgo problem set", status: "not started", priority: "P3" }] },
    });
    executorDeleteTaskMock.mockResolvedValue({
      ok: true,
      id: "task-abc",
      receipt: { id: "task-abc", title: "orgo problem set", deleted: true },
    });
    executorCreateTaskMock.mockResolvedValue({
      ok: true,
      id: "task-new",
      receipt: { id: "task-new", title: "buy milk", priority: "P3", due: null },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("find then delete completes in one user turn (2 passes)", async () => {
    mockDbRows();
    anthropicStreamMock.mockImplementation(
      buildStreamSequence([
        {
          blocks: [
            { type: "text", text: "I'll find it." },
            { type: "tool_use", id: "tu_find_1", name: "find_tasks", input: { query: "orgo" } },
          ],
          stopReason: "tool_use",
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
        {
          blocks: [
            { type: "text", text: "Deleting." },
            { type: "tool_use", id: "tu_del_1", name: "delete_task", input: { id: "task-abc" } },
          ],
          stopReason: "end_turn",
          usage: { input_tokens: 80, output_tokens: 30, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
        },
      ])
    );

    const actions: Array<{ toolUseId: string; name: string; result: unknown }> = [];
    let doneUsage: unknown;
    let doneCallCount = 0;

    await runJarvisTurnStream({
      userId: USER_ID,
      input: "delete the orgo problem set",
      isVoice: false,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onAction: (toolUseId, name, result) => actions.push({ toolUseId, name, result }),
      onDone: (usage) => { doneCallCount++; doneUsage = usage; },
      onError: vi.fn(),
    });

    // onDone must fire exactly ONCE
    expect(doneCallCount).toBe(1);

    // Both tool calls should have triggered onAction
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.name)).toContain("find_tasks");
    expect(actions.map((a) => a.name)).toContain("delete_task");

    // Usage should be SUMMED across both passes
    const usage = doneUsage as { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
    expect(usage.input_tokens).toBe(180); // 100 + 80
    expect(usage.output_tokens).toBe(80); // 50 + 30
    expect(usage.cache_read_input_tokens).toBe(100); // 0 + 100

    // Anthropic was called TWICE (pass 1 + pass 2)
    expect(anthropicStreamMock).toHaveBeenCalledTimes(2);

    // Executor received correct calls
    expect(executorFindTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: "orgo" }),
      expect.anything(),
    );
    expect(executorDeleteTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-abc" }),
      expect.anything(),
    );
  });

  it("single-pass create_task terminates after 1 pass", async () => {
    mockDbRows();
    anthropicStreamMock.mockImplementation(
      buildStreamSequence([
        {
          blocks: [
            { type: "tool_use", id: "tu_create_1", name: "create_task", input: { title: "buy milk" } },
          ],
          stopReason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 80 },
        },
      ])
    );

    let doneCallCount = 0;
    let doneUsage: unknown;

    await runJarvisTurnStream({
      userId: USER_ID,
      input: "buy milk",
      isVoice: false,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onAction: vi.fn(),
      onDone: (usage) => { doneCallCount++; doneUsage = usage; },
      onError: vi.fn(),
    });

    // Loop exits after exactly 1 pass
    expect(anthropicStreamMock).toHaveBeenCalledTimes(1);

    // onDone fires once
    expect(doneCallCount).toBe(1);

    // Usage reflects the single pass
    const usage = doneUsage as { input_tokens: number; cache_creation_input_tokens: number };
    expect(usage.input_tokens).toBe(100);
    expect(usage.cache_creation_input_tokens).toBe(80);
  });

  it("respects LOOP_CAP when model never stops tool_use", async () => {
    mockDbRows();
    // Mock always returns stop_reason=tool_use with a find_tasks call
    anthropicStreamMock.mockImplementation(
      buildStreamSequence(
        // Single entry repeated — the sequence builder re-uses last entry
        [
          {
            blocks: [
              { type: "tool_use", id: "tu_find_cap", name: "find_tasks", input: { query: "anything" } },
            ],
            stopReason: "tool_use",
            usage: { input_tokens: 50, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        ]
      )
    );

    let doneCallCount = 0;

    await runJarvisTurnStream({
      userId: USER_ID,
      input: "keep searching forever",
      isVoice: false,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onAction: vi.fn(),
      onDone: () => { doneCallCount++; },
      onError: vi.fn(),
    });

    // Must cap at LOOP_CAP=5 and still fire onDone
    expect(anthropicStreamMock).toHaveBeenCalledTimes(5);
    expect(doneCallCount).toBe(1);
  });

  it("session-entities scratchpad appears in system without cache_control after a create tool", async () => {
    mockDbRows();
    const capturedParams: Array<unknown> = [];

    // Pass 1: create_task (creates an entity) → stop_reason="tool_use"
    // Pass 2: model references the created task and ends
    // Note: find_* tools do NOT add to session entities (correct per design).
    // create_* DO add to session entities, so after pass 1 the scratchpad is populated.
    anthropicStreamMock.mockImplementation(
      buildStreamSequence(
        [
          {
            blocks: [
              { type: "tool_use", id: "tu_create_scratchpad", name: "create_task", input: { title: "orgo problem set" } },
            ],
            stopReason: "tool_use",
          },
          {
            blocks: [
              { type: "text", text: "Done." },
            ],
            stopReason: "end_turn",
          },
        ],
        capturedParams,
      )
    );

    await runJarvisTurnStream({
      userId: USER_ID,
      input: "add orgo problem set",
      isVoice: false,
      sttDoneAt: null,
      vadEndAt: undefined,
      onTextDelta: vi.fn(),
      onAction: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    // Two passes were made (create_task returned stop_reason=tool_use)
    expect(capturedParams).toHaveLength(2);

    // The scratchpad block always STARTS its text with "SESSION ENTITIES" —
    // distinguish from personality text that merely mentions the term inline.
    const isScratchpadBlock = (b: { type: string; text?: string }) =>
      b.type === "text" && typeof b.text === "string" && b.text.startsWith("SESSION ENTITIES");

    // Pass 1 system should NOT have a SESSION ENTITIES scratchpad block (no entities yet)
    const pass1Params = capturedParams[0] as { system: Array<{ type: string; text: string; cache_control?: unknown }> };
    const pass1SessionBlock = pass1Params.system.find(isScratchpadBlock);
    expect(pass1SessionBlock).toBeUndefined();

    // Pass 2 system MUST contain SESSION ENTITIES scratchpad (create_task result populated entities)
    const pass2Params = capturedParams[1] as { system: Array<{ type: string; text: string; cache_control?: unknown }> };
    const pass2SessionBlock = pass2Params.system.find(isScratchpadBlock);
    expect(pass2SessionBlock).toBeDefined();
    expect(pass2SessionBlock?.text).toContain("task-new"); // from executorCreateTaskMock returning id="task-new"

    // The scratchpad block MUST NOT carry cache_control (Pitfall 3)
    expect(pass2SessionBlock?.cache_control).toBeUndefined();
  });
});
