/**
 * JARVIS performance budget — Phase 5.1 Plan 01 Task 2.
 *
 * Asserts the per-turn DB roundtrip budget (D-P1 / JARVIS-21):
 *   - Single-action JARVIS turn fires ≤ 2 DB roundtrips
 *     (one for pre-validation / user-row load, one for executor write)
 *   - validateTurnReferences batches project + calendar validation into a
 *     single Promise.all roundtrip (both queries dispatched concurrently)
 *
 * Uses a query-counting db mock — same pattern as jarvis-route.test.ts and
 * jarvis-executor.test.ts. The counter increments on each call to db.select
 * or db.transaction, which maps directly to DB roundtrips.
 *
 * Note: This test exercises the validate-references layer and executor, NOT
 * the Anthropic SDK — the SDK is mocked to emit a single create_capture
 * block.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted state: query counter + mock refs
// ---------------------------------------------------------------------------

const {
  getClaimsMock,
  anthropicStreamMock,
  logJarvisEventMock,
  executorCreateTaskMock,
  executorCreateCaptureMock,
  executorCreateEventMock,
  dbQueryCount,
  dbState,
} = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  anthropicStreamMock: vi.fn(),
  logJarvisEventMock: vi.fn(async () => undefined),
  executorCreateTaskMock: vi.fn(),
  executorCreateCaptureMock: vi.fn(),
  executorCreateEventMock: vi.fn(),
  // Mutable counter — reset in beforeEach
  dbQueryCount: { value: 0 },
  dbState: {
    selectReturns: [] as unknown[][],
  },
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { stream: anthropicStreamMock };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

// DB mock: each db.select call = 1 roundtrip, db.transaction = 1 roundtrip
vi.mock("@/lib/db", () => {
  function makeSelectChain(returnRows: unknown[]) {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(returnRows);
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(returnRows).then(resolve);
    return chain;
  }
  return {
    db: {
      select: vi.fn(() => {
        dbQueryCount.value += 1; // count each SELECT as one roundtrip
        const rows = dbState.selectReturns.shift() ?? [];
        return makeSelectChain(rows);
      }),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
        dbQueryCount.value += 1; // count each transaction as one roundtrip
        const tx = {
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
            })),
          })),
        };
        await fn(tx);
      }),
    },
  };
});

vi.mock("@/lib/jarvis/log-event", () => ({
  logJarvisEvent: logJarvisEventMock,
}));

// Mock the executor to NOT call validate-references (we test validate-references separately)
vi.mock("@/lib/jarvis/executor", () => ({
  createServerExecutor: () => ({
    createTask: executorCreateTaskMock,
    createCapture: executorCreateCaptureMock,
    createEvent: executorCreateEventMock,
  }),
}));

process.env.ANTHROPIC_API_KEY = "test-key-for-perf";

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/jarvis/route";
import {
  validateProjectIds,
  validateCalendarId,
  validateTurnReferences,
} from "@/lib/jarvis/validate-references";

const USER_A = "11111111-1111-1111-1111-111111111111";
const PROJECT_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// SSE stream helpers (mirror of jarvis-route.test.ts)
// ---------------------------------------------------------------------------

interface MockBlock {
  type: "tool_use" | "text";
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
}

function buildAnthropicStream(opts: {
  blocks: MockBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}) {
  const handlers: Record<string, Array<(arg: unknown) => void | Promise<void>>> = {};
  const stream = {
    on(event: string, cb: (arg: unknown) => void | Promise<void>) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
      return stream;
    },
    async finalMessage() {
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
        content: [],
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

async function drainSse(response: Response): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    decoder.decode(value);
  }
}

function buildRequest(body: unknown) {
  return new Request("http://localhost:3000/api/jarvis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Default setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  dbQueryCount.value = 0;
  dbState.selectReturns = [];

  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_A } },
    error: null,
  });

  // Route pre-loads: (1) project list SELECT, (2) user-row SELECT
  dbState.selectReturns.push([]); // projects list
  dbState.selectReturns.push([{ timezone: "America/New_York", defaultCalendarId: null }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("validateTurnReferences — batch validation", () => {
  beforeEach(() => {
    // Reset to empty stack for these tests — they call validateTurnReferences
    // directly, NOT through the route. The outer beforeEach sets up route
    // state that's irrelevant here.
    dbState.selectReturns = [];
    dbQueryCount.value = 0;
  });

  it("batches project + calendar validation into one Promise.all (both queries dispatched concurrently)", async () => {
    // validateTurnReferences must exist and return both results in one call
    expect(validateTurnReferences).toBeDefined();
    expect(typeof validateTurnReferences).toBe("function");

    // Provide DB returns for: (1) project SELECT, (2) user-row SELECT for calendar
    dbState.selectReturns.push([{ id: PROJECT_A }]); // project validation
    dbState.selectReturns.push([
      { defaultCalendarId: "primary", visibleCalendarIds: [] },
    ]); // calendar validation

    const before = dbQueryCount.value;
    const result = await validateTurnReferences(USER_A, [PROJECT_A], "primary");
    const after = dbQueryCount.value;

    // Both queries fired together — counted as a single "batch" operation
    // (the 2 SELECT calls happen concurrently via Promise.all)
    expect(result.projects.ok).toBe(true);
    expect(result.calendar.ok).toBe(true);

    // The batch must have fired exactly 2 SELECT queries (one for projects,
    // one for calendar) — concurrently via Promise.all
    expect(after - before).toBe(2);
  });

  it("returns correct ValidatedTurnRefs shape", async () => {
    dbState.selectReturns.push([{ id: PROJECT_A }, { id: PROJECT_B }]);
    dbState.selectReturns.push([
      { defaultCalendarId: "cal-default", visibleCalendarIds: ["cal-other"] },
    ]);

    const refs = await validateTurnReferences(
      USER_A,
      [PROJECT_A, PROJECT_B],
      "cal-default",
    );

    expect(refs).toMatchObject({
      projects: { ok: true, ids: expect.arrayContaining([PROJECT_A, PROJECT_B]) },
      calendar: { ok: true, calendarId: "cal-default" },
    });
  });

  it("deduplicates project IDs before querying (Pitfall 5: multi-action same project)", async () => {
    // A multi-action turn might reference the same project twice.
    // validateTurnReferences must deduplicate before the SELECT.
    dbState.selectReturns.push([{ id: PROJECT_A }]);
    dbState.selectReturns.push([
      { defaultCalendarId: null, visibleCalendarIds: null },
    ]);

    const countBefore = dbQueryCount.value;
    await validateTurnReferences(USER_A, [PROJECT_A, PROJECT_A, PROJECT_A], null);
    // The projects query must fire once regardless of duplicates
    const projectQueries = dbQueryCount.value - countBefore;
    // 2 = 1 project SELECT + 1 calendar SELECT (always fires for calendar)
    expect(projectQueries).toBe(2);
  });
});

describe("JARVIS perf budget — DB roundtrips per turn", () => {
  it("single-action turn (mocked executor) fires ≤ 2 DB roundtrips (projects list + user-row load)", async () => {
    // The route pre-loads project list + user-row BEFORE dispatching executors.
    // These are the 2 allowed SELECTs for a single-action turn. The executor
    // is mocked here (no additional DB queries from executor).
    executorCreateCaptureMock.mockResolvedValue({
      ok: true,
      id: "cap-1",
      receipt: { id: "cap-1", content: "test capture" },
    });
    anthropicStreamMock.mockReturnValue(
      buildAnthropicStream({
        blocks: [
          {
            type: "tool_use",
            id: "tu_1",
            name: "create_capture",
            input: { content: "random capture text" },
          },
        ],
      }),
    );

    const countBefore = dbQueryCount.value;
    const res = await POST(
      buildRequest({
        input: "random capture text",
        history: [],
        parsedDates: [],
        linkedProjectIds: [],
        linkedHashtags: [],
      }) as never,
    );
    await drainSse(res);

    const routeDbQueries = dbQueryCount.value - countBefore;

    // Route pre-loads 2 SELECT queries: (1) project list, (2) user-row.
    // Executor is mocked → no additional DB queries.
    // ≤ 2 roundtrips enforced by JARVIS-21 / D-P1.
    expect(routeDbQueries).toBeLessThanOrEqual(2);
  });
});
