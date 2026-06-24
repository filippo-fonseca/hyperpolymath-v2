/**
 * POST /api/jarvis SSE Route Handler — Phase 5 Plan 05-02 Task 3.
 *
 * Verifies:
 *   1. Auth — 401 when getClaims returns no claims.
 *   2. Successful response carries Content-Type: text/event-stream,
 *      X-Accel-Buffering: no, Cache-Control: no-cache, no-transform.
 *   3. tool_use blocks → SSE 'action' events fire with executor results.
 *   4. Parallel tool_use → multiple 'action' events in one stream
 *      (verifies parallel_tool_use works without flag — research §1.4).
 *   5. Cross-tenant project_id → executor returns kind:"validation" and
 *      the SSE 'action' event surfaces it as result.ok:false.
 *   6. AbortController: client req.signal.abort() → upstream.abort()
 *      fires (verified via Anthropic SDK signal option being honored).
 *   7. After stream end: 'done' event has usage with all 4 token counts;
 *      logJarvisEvent called with correct shape.
 *   8. Fabricated tool name (e.g. "drop_database") → SSE 'error' event,
 *      NO 'action' event, executor never dispatched.
 *      NOTE (Phase 16): delete_task is now a REAL tool. Fabricated-tool tests
 *      must use names that will never be real (drop_database, exec_sql).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted spies + state
// ---------------------------------------------------------------------------

const {
  getClaimsMock,
  anthropicStreamMock,
  logJarvisEventMock,
  executorCreateTaskMock,
  executorCreateCaptureMock,
  executorCreateEventMock,
  dbState,
} = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  anthropicStreamMock: vi.fn(),
  logJarvisEventMock: vi.fn(async () => undefined),
  executorCreateTaskMock: vi.fn(),
  executorCreateCaptureMock: vi.fn(),
  executorCreateEventMock: vi.fn(),
  dbState: {
    selectReturns: [] as unknown[][],
  },
}));

// --- Supabase server mock --------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

// --- Anthropic SDK mock ----------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = {
      stream: anthropicStreamMock,
    };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

// --- DB mock (project + user row queries) ----------------------------------

vi.mock("@/lib/db", () => {
  function makeSelectChain(returnRows: unknown[]) {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    // Phase 11: route now uses .orderBy().limit() on captures + tasks queries.
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(returnRows);
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(returnRows).then(resolve);
    return chain;
  }
  return {
    db: {
      select: vi.fn(() => {
        const rows = dbState.selectReturns.shift() ?? [];
        return makeSelectChain(rows);
      }),
      insert: vi.fn(() => ({ values: vi.fn() })),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    },
  };
});

// --- BYOK key resolver mock ------------------------------------------------
// The route resolves the caller's own Anthropic key before streaming; without
// this mock getUserKey hits the (mocked) db, finds no row, and 402s before any
// SSE is produced.

vi.mock("@/lib/byok/keys", () => ({
  getUserKey: vi.fn(async () => "sk-ant-test"),
  getUserKeyOrNull: vi.fn(async () => "sk-ant-test"),
  MissingKeyError: class MissingKeyError extends Error {
    provider: string;
    constructor(provider: string) {
      super(`Missing ${provider} API key for user`);
      this.name = "MissingKeyError";
      this.provider = provider;
    }
  },
}));

// --- Telemetry mock --------------------------------------------------------

vi.mock("@/lib/jarvis/log-event", () => ({
  logJarvisEvent: logJarvisEventMock,
}));

// --- Executor mock (don't exercise real Drizzle paths) ---------------------

vi.mock("@/lib/jarvis/executor", () => ({
  createServerExecutor: () => ({
    createTask: executorCreateTaskMock,
    createCapture: executorCreateCaptureMock,
    createEvent: executorCreateEventMock,
    rememberFact: vi.fn(async () => ({ ok: true, id: "fact:test", receipt: {} })),
    askClarification: vi.fn(async () => ({ ok: true, id: "clarification:test", receipt: {} })),
  }),
}));

// Phase 5.1 (D-M4 / JARVIS-18): route now loads facts before buildSystemPrompt.
// Mock to return empty facts — jarvis-route.test.ts doesn't test memory paths.
vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: vi.fn(async () => []),
}));

// --- Anthropic API key env var ---------------------------------------------

process.env.ANTHROPIC_API_KEY = "test-key-for-routing";

// ---------------------------------------------------------------------------
// Imports under test (post-mock)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/jarvis/route";

const USER_A = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockBlock {
  type: "tool_use" | "text";
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
}

/**
 * Build an Anthropic-stream-shaped object exposing .on(event, cb) and
 * .finalMessage(). When finalMessage() is awaited it fires every registered
 * contentBlock handler in sequence with each pre-canned block, then resolves
 * to the final message metadata (usage tokens, id).
 */
function buildAnthropicStream(opts: {
  blocks: MockBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  abortSignal?: AbortSignal;
}) {
  const handlers: Record<string, Array<(arg: unknown) => void | Promise<void>>> = {};
  const stream = {
    on(event: string, cb: (arg: unknown) => void | Promise<void>) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
      return stream;
    },
    async finalMessage() {
      if (opts.abortSignal?.aborted) {
        const err = new Error("aborted");
        (err as { name: string }).name = "AbortError";
        throw err;
      }
      for (const block of opts.blocks) {
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
            await h(block.text);
          }
        }
      }
      return {
        id: "msg_test",
        usage: opts.usage ?? {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 80,
        },
      };
    },
  };
  return stream;
}

async function readSseEvents(
  response: Response,
): Promise<Array<{ event: string; data: unknown }>> {
  const events: Array<{ event: string; data: unknown }> = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    let i = buffer.indexOf("\n\n");
    while (i !== -1) {
      const chunk = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      // SSE event names may contain hyphens (e.g. `turn-start`); allow them.
      const eventName = chunk.match(/^event: ([\w-]+)$/m)?.[1] ?? "";
      const dataLine = chunk.match(/^data: (.+)$/m)?.[1] ?? "null";
      events.push({ event: eventName, data: JSON.parse(dataLine) });
      i = buffer.indexOf("\n\n");
    }
  }
  return events;
}

function buildRequest(
  body: unknown,
  opts?: {
    abort?: AbortController;
    voiceActive?: boolean;
    /** Phase 9 / TEL-01: epoch-ms forwarded as X-Jarvis-Stt-Done-At header. */
    sttDoneAt?: number;
  },
) {
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts?.voiceActive ? { "X-Voice-Active": "true" } : {}),
      ...(opts?.sttDoneAt != null
        ? { "X-Jarvis-Stt-Done-At": String(opts.sttDoneAt) }
        : {}),
    },
    body: JSON.stringify(body),
  };
  if (opts?.abort) init.signal = opts.abort.signal;
  return new Request("http://localhost:3000/api/jarvis", init);
}

// ---------------------------------------------------------------------------
// Default test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectReturns = [];
  // Default: authed as USER_A
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_A } },
    error: null,
  });
  // Default Phase 10 + Phase 11 Promise.all queue:
  //   1. projects.list, 2. user-row (with stateVersion), 3. areas,
  //   4. recent captures, 5. active tasks
  dbState.selectReturns.push([]); // projects.list
  dbState.selectReturns.push([
    {
      timezone: "America/New_York",
      defaultCalendarId: null,
      stateVersion: 1n,
    },
  ]);
  dbState.selectReturns.push([]); // areas
  dbState.selectReturns.push([]); // recent captures
  dbState.selectReturns.push([]); // active tasks
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("POST /api/jarvis — auth", () => {
  it("401 when getClaims returns no claims", async () => {
    getClaimsMock.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(buildRequest({ input: "hi", history: [] }) as never);
    expect(res.status).toBe(401);
  });

  it("401 when getClaims returns an error", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: null,
      error: { message: "no session" },
    });
    const res = await POST(buildRequest({ input: "hi", history: [] }) as never);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/jarvis — headers", () => {
  it("returns SSE headers on success", async () => {
    anthropicStreamMock.mockReturnValue(buildAnthropicStream({ blocks: [] }));
    const res = await POST(buildRequest({ input: "hi", history: [] }) as never);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    // Drain the stream so it doesn't leak
    await readSseEvents(res);
  });
});

describe("POST /api/jarvis — streaming", () => {
  it("single create_task tool_use → 'action' event with executor result", async () => {
    executorCreateTaskMock.mockResolvedValue({
      ok: true,
      id: "task-1",
      receipt: { id: "task-1", title: "Pick up groceries" },
    });
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          {
            type: "tool_use",
            id: "tu_1",
            name: "create_task",
            input: { title: "Pick up groceries" },
          },
        ],
      }),
    );

    const res = await POST(
      buildRequest({ input: "pick up groceries", history: [] }) as never,
    );
    const events = await readSseEvents(res);

    const actions = events.filter((e) => e.event === "action");
    expect(actions).toHaveLength(1);
    const action = actions[0].data as {
      toolUseId: string;
      name: string;
      result: { ok: boolean; id: string };
    };
    expect(action.name).toBe("create_task");
    expect(action.result.ok).toBe(true);
    expect(action.result.id).toBe("task-1");

    const done = events.find((e) => e.event === "done");
    expect(done).toBeDefined();
    const usage = (done!.data as { usage: Record<string, number> }).usage;
    expect(usage).toHaveProperty("input_tokens");
    expect(usage).toHaveProperty("output_tokens");
    expect(usage).toHaveProperty("cache_read_input_tokens");
    expect(usage).toHaveProperty("cache_creation_input_tokens");
  });

  it("parallel tool_use (3 blocks) → 3 'action' events in one stream", async () => {
    executorCreateTaskMock.mockResolvedValue({
      ok: true,
      id: "task-1",
      receipt: {},
    });
    executorCreateCaptureMock.mockResolvedValue({
      ok: true,
      id: "cap-1",
      receipt: {},
    });
    executorCreateEventMock.mockResolvedValue({
      ok: true,
      id: "ev-1",
      receipt: {},
    });
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          { type: "tool_use", name: "create_task", input: { title: "T" } },
          { type: "tool_use", name: "create_capture", input: { content: "C" } },
          {
            type: "tool_use",
            name: "create_event",
            input: {
              title: "E",
              start: "2026-05-14T20:00:00.000Z",
              end: "2026-05-14T22:00:00.000Z",
            },
          },
        ],
      }),
    );

    const res = await POST(
      buildRequest({ input: "multi action", history: [] }) as never,
    );
    const events = await readSseEvents(res);
    const actions = events.filter((e) => e.event === "action");
    expect(actions).toHaveLength(3);
    expect(actions.map((a) => (a.data as { name: string }).name).sort()).toEqual([
      "create_capture",
      "create_event",
      "create_task",
    ]);
  });

  it("executor validation rejection surfaces as result.ok:false in action event", async () => {
    executorCreateTaskMock.mockResolvedValue({
      ok: false,
      kind: "validation",
      error: "Unknown projects: stranger-id",
    });
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          {
            type: "tool_use",
            name: "create_task",
            input: {
              title: "Sabotage",
              // Valid v4 UUID format: third block [1-8]xxx (version), fourth
              // block [89ab]xxx (variant). cccc... would fail variant byte.
              project_ids: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
            },
          },
        ],
      }),
    );

    const res = await POST(
      buildRequest({ input: "sabotage", history: [] }) as never,
    );
    const events = await readSseEvents(res);
    const action = events.find((e) => e.event === "action");
    expect(action).toBeDefined();
    const result = (action!.data as { result: { ok: boolean; kind?: string } }).result;
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("validation");
  });

  it("fabricated tool name → SSE 'error' event, NO 'action' dispatch", async () => {
    // Phase 16: delete_task is now a real tool. Using drop_database instead —
    // a name that will never be a real JARVIS tool.
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          {
            type: "tool_use",
            id: "tu_fab",
            name: "drop_database",
            input: { id: "task-1" },
          },
        ],
      }),
    );
    const res = await POST(
      buildRequest({ input: "destroy everything", history: [] }) as never,
    );
    const events = await readSseEvents(res);
    const actions = events.filter((e) => e.event === "action");
    const errors = events.filter((e) => e.event === "error");
    expect(actions).toHaveLength(0);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect((errors[0].data as { message: string }).message).toMatch(/Unknown tool/i);
    expect(executorCreateTaskMock).not.toHaveBeenCalled();
    expect(executorCreateCaptureMock).not.toHaveBeenCalled();
    expect(executorCreateEventMock).not.toHaveBeenCalled();
  });

  it("Zod validation failure → SSE 'error' event, NO executor dispatch", async () => {
    // Pass an input that fails zCreateTask.parse — missing required `title`
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          {
            type: "tool_use",
            name: "create_task",
            input: { /* no title */ priority: "P1" },
          },
        ],
      }),
    );
    const res = await POST(
      buildRequest({ input: "malformed", history: [] }) as never,
    );
    const events = await readSseEvents(res);
    const errors = events.filter((e) => e.event === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(executorCreateTaskMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/jarvis — telemetry", () => {
  it("logJarvisEvent called after successful stream", async () => {
    executorCreateTaskMock.mockResolvedValue({
      ok: true,
      id: "task-1",
      receipt: {},
    });
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          { type: "tool_use", name: "create_task", input: { title: "T" } },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 20,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 0,
        },
      }),
    );

    const res = await POST(
      buildRequest({ input: "buy stuff", history: [] }) as never,
    );
    await readSseEvents(res);
    // Wait a tick for fire-and-forget telemetry
    await new Promise((r) => setTimeout(r, 0));

    expect(logJarvisEventMock).toHaveBeenCalledTimes(1);
    const callsAny = logJarvisEventMock.mock.calls as unknown as unknown[][];
    const call = callsAny[0][0] as {
      userId: string;
      promptText: string;
      actionTypes: string[];
      usage: { cache_read_input_tokens?: number };
      latencyMs: number;
      // Phase 9 / TEL-01: stages block must be present with at least promptBuiltAt.
      stages?: { promptBuiltAt?: Date };
      id?: string;
    };
    expect(call.userId).toBe(USER_A);
    expect(call.promptText).toBe("buy stuff");
    expect(call.actionTypes).toContain("create_task");
    expect(call.usage.cache_read_input_tokens).toBe(100);
    expect(typeof call.latencyMs).toBe("number");
    // Phase 9 / TEL-01 back-compat: stages.promptBuiltAt MUST be a Date — every
    // turn ships the prompt-built timestamp regardless of voice/text. The id
    // is pinned so Plan 09-02's beacon can UPDATE WHERE id = $turnId.
    expect(call.stages).toBeDefined();
    expect(call.stages?.promptBuiltAt).toBeInstanceOf(Date);
    expect(typeof call.id).toBe("string");
    expect(call.id?.length ?? 0).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Phase 9 / TEL-01 — turn-start SSE event + stage timestamps
// ===========================================================================

describe("POST /api/jarvis — turn-start SSE event (Phase 9 / TEL-01)", () => {
  it("first emitted SSE event is `turn-start` with a UUID turnId", async () => {
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [{ type: "text", text: "ok" }],
      }),
    );
    const res = await POST(
      buildRequest({ input: "hi", history: [] }) as never,
    );
    const events = await readSseEvents(res);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].event).toBe("turn-start");
    const data = events[0].data as { turnId?: unknown };
    expect(typeof data.turnId).toBe("string");
    expect(data.turnId as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("turn-start event id matches the logJarvisEvent id (correlation key for Plan 09-02 beacon)", async () => {
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({ blocks: [{ type: "text", text: "ok" }] }),
    );
    const res = await POST(
      buildRequest({ input: "hi", history: [] }) as never,
    );
    const events = await readSseEvents(res);
    await new Promise((r) => setTimeout(r, 0));
    const turnStart = events[0].data as { turnId: string };
    const callsAny = logJarvisEventMock.mock.calls as unknown as unknown[][];
    const call = callsAny[0][0] as { id?: string };
    expect(call.id).toBe(turnStart.turnId);
  });
});

describe("POST /api/jarvis — stage timestamps (Phase 9 / TEL-01)", () => {
  it("logJarvisEvent receives stages.promptBuiltAt + firstTokenAt + lastTokenAt + toolLoopDoneAt on a happy-path turn", async () => {
    executorCreateTaskMock.mockResolvedValue({
      ok: true,
      id: "task-1",
      receipt: {},
    });
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          { type: "text", text: "Filing now." },
          { type: "tool_use", name: "create_task", input: { title: "T" } },
        ],
      }),
    );

    const res = await POST(
      buildRequest({ input: "buy milk", history: [] }) as never,
    );
    await readSseEvents(res);
    await new Promise((r) => setTimeout(r, 0));

    const callsAny = logJarvisEventMock.mock.calls as unknown as unknown[][];
    const call = callsAny[0][0] as {
      stages?: {
        promptBuiltAt?: Date;
        firstTokenAt?: Date;
        lastTokenAt?: Date;
        toolLoopDoneAt?: Date;
      };
    };
    expect(call.stages?.promptBuiltAt).toBeInstanceOf(Date);
    expect(call.stages?.firstTokenAt).toBeInstanceOf(Date);
    expect(call.stages?.lastTokenAt).toBeInstanceOf(Date);
    expect(call.stages?.toolLoopDoneAt).toBeInstanceOf(Date);
    // Monotonic ordering — same Date.now() in one microtask is acceptable,
    // hence <= rather than strict <.
    const pb = call.stages!.promptBuiltAt!.getTime();
    const ft = call.stages!.firstTokenAt!.getTime();
    const lt = call.stages!.lastTokenAt!.getTime();
    const td = call.stages!.toolLoopDoneAt!.getTime();
    expect(pb).toBeLessThanOrEqual(ft);
    expect(ft).toBeLessThanOrEqual(lt);
    expect(lt).toBeLessThanOrEqual(td);
  });

  it("X-Jarvis-Stt-Done-At request header is read into stages.sttDoneAt", async () => {
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({ blocks: [{ type: "text", text: "ok" }] }),
    );
    const res = await POST(
      buildRequest(
        { input: "hi", history: [] },
        { sttDoneAt: 1717000000000 },
      ) as never,
    );
    await readSseEvents(res);
    await new Promise((r) => setTimeout(r, 0));
    const callsAny = logJarvisEventMock.mock.calls as unknown as unknown[][];
    const call = callsAny[0][0] as { stages?: { sttDoneAt?: Date } };
    expect(call.stages?.sttDoneAt).toBeInstanceOf(Date);
    expect(call.stages?.sttDoneAt?.getTime()).toBe(1717000000000);
  });

  it("absent X-Jarvis-Stt-Done-At header leaves stages.sttDoneAt null", async () => {
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({ blocks: [{ type: "text", text: "ok" }] }),
    );
    const res = await POST(
      buildRequest({ input: "hi", history: [] }) as never,
    );
    await readSseEvents(res);
    await new Promise((r) => setTimeout(r, 0));
    const callsAny = logJarvisEventMock.mock.calls as unknown as unknown[][];
    const call = callsAny[0][0] as { stages?: { sttDoneAt?: Date | null } };
    expect(call.stages?.sttDoneAt).toBeNull();
  });
});

describe("POST /api/jarvis — AbortController", () => {
  it("client req.signal abort → upstream signal also aborts", async () => {
    let capturedSignal: AbortSignal | undefined;
    anthropicStreamMock.mockImplementation(
      (_params: unknown, opts: { signal?: AbortSignal }) => {
        capturedSignal = opts?.signal;
        const handlers: Record<string, Array<(arg: unknown) => void>> = {};
        return {
          on(event: string, cb: (arg: unknown) => void) {
            handlers[event] = handlers[event] ?? [];
            handlers[event].push(cb);
            return this;
          },
          // Hanging stream — finalMessage resolves only on abort.
          finalMessage: () =>
            new Promise((_resolve, reject) => {
              opts?.signal?.addEventListener("abort", () => {
                const err = new Error("aborted");
                (err as { name: string }).name = "AbortError";
                reject(err);
              });
            }),
        };
      },
    );

    const abort = new AbortController();
    const reqPromise = POST(
      buildRequest({ input: "hi", history: [] }, { abort }) as never,
    );
    // Trigger abort mid-flight after the stream has been wired up.
    setTimeout(() => abort.abort(), 10);
    const res = await reqPromise;
    await readSseEvents(res);
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);
  });
});

describe("POST /api/jarvis — slash commands", () => {
  it("/ask forces tool_choice: { type: 'none' } so the model replies in text only", async () => {
    let captured:
      | {
          tool_choice?: { type: string; name?: string };
        }
      | undefined;
    anthropicStreamMock.mockImplementation((params: unknown) => {
      captured = params as { tool_choice?: { type: string; name?: string } };
      return buildAnthropicStream({
        blocks: [{ type: "text", text: "You filed two captures today, sir." }],
      });
    });

    const res = await POST(
      buildRequest({
        input: "what did I just file?",
        history: [
          { role: "user", content: "pick up groceries" },
          { role: "assistant", content: "Noted." },
        ],
        slashCommand: "ask",
      }) as never,
    );
    const events = await readSseEvents(res);

    expect(captured?.tool_choice).toEqual({ type: "none" });

    // No action events when ask is forced — text-only reply.
    const actions = events.filter((e) => e.event === "action");
    expect(actions).toHaveLength(0);

    // Text deltas land instead.
    const texts = events.filter((e) => e.event === "text");
    expect(texts.length).toBeGreaterThan(0);
  });

  it("/task forces tool_choice: { type: 'tool', name: 'create_task' }", async () => {
    let captured:
      | { tool_choice?: { type: string; name?: string } }
      | undefined;
    anthropicStreamMock.mockImplementation((params: unknown) => {
      captured = params as { tool_choice?: { type: string; name?: string } };
      return buildAnthropicStream({ blocks: [] });
    });
    executorCreateTaskMock.mockResolvedValue({ ok: true, id: "t", receipt: {} });

    const res = await POST(
      buildRequest({
        input: "pick up groceries",
        history: [],
        slashCommand: "task",
      }) as never,
    );
    await readSseEvents(res);
    expect(captured?.tool_choice).toEqual({ type: "tool", name: "create_task" });
  });

  it("no slashCommand → tool_choice: { type: 'auto' }", async () => {
    let captured:
      | { tool_choice?: { type: string; name?: string } }
      | undefined;
    anthropicStreamMock.mockImplementation((params: unknown) => {
      captured = params as { tool_choice?: { type: string; name?: string } };
      return buildAnthropicStream({ blocks: [] });
    });
    const res = await POST(
      buildRequest({ input: "pick up groceries", history: [] }) as never,
    );
    await readSseEvents(res);
    expect(captured?.tool_choice).toEqual({ type: "auto" });
  });
});

describe("POST /api/jarvis — voice forward-compat", () => {
  it("X-Voice-Active header propagates to telemetry voiceActive", async () => {
    executorCreateTaskMock.mockResolvedValue({ ok: true, id: "t", receipt: {} });
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          { type: "tool_use", name: "create_task", input: { title: "x" } },
        ],
      }),
    );

    const res = await POST(
      buildRequest(
        { input: "x", history: [] },
        { voiceActive: true },
      ) as never,
    );
    await readSseEvents(res);
    await new Promise((r) => setTimeout(r, 0));

    const callsAny = logJarvisEventMock.mock.calls as unknown as unknown[][];
    const call = callsAny[0][0] as { voiceActive: boolean };
    expect(call.voiceActive).toBe(true);
  });
});
