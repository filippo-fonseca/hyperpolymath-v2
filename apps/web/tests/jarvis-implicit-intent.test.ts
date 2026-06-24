/**
 * Phase 5.1 (D-P4 / JARVIS-22) — Implicit-intent fidelity test corpus.
 *
 * Tests that fragmented and explicit phrasings of the same intent produce
 * structurally equivalent action sets — same tool names, same key fields.
 *
 * MOCKED MODE (default): stubs the Anthropic SDK with pre-canned tool_use
 * blocks per fixture, POSTs to the REAL route handler, and asserts the route
 * correctly dispatches all expected tool names. This is a REGRESSION GUARD
 * for the dispatch pipeline (not a model-quality test).
 *
 * LIVE MODE (ANTHROPIC_LIVE=true): calls the real Anthropic API for both
 * fragmented + explicit phrasings, then asserts ≥ 95% structural equivalence.
 * This is the JARVIS-22 acceptance assertion — run on demand, NOT every PR.
 * Live mode is implemented in jarvis-implicit-intent.live.test.ts (a separate
 * file that does NOT install the SDK mock).
 *
 * Pattern mirrors jarvis-route.test.ts exactly (Phase 5 mock harness).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted spies
// ---------------------------------------------------------------------------

const {
  getClaimsMock,
  anthropicStreamMock,
  logJarvisEventMock,
  executorCreateTaskMock,
  executorCreateCaptureMock,
  executorCreateEventMock,
} = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  anthropicStreamMock: vi.fn(),
  logJarvisEventMock: vi.fn(async () => undefined),
  executorCreateTaskMock: vi.fn(),
  executorCreateCaptureMock: vi.fn(),
  executorCreateEventMock: vi.fn(),
}));

// --- BYOK key resolver mock ------------------------------------------------
// Routes resolve the caller's own API key before doing work; without this mock
// getUserKey hits the (mocked) db, finds no row, and 402s before any output.
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

// --- Supabase server mock --------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

// --- Anthropic SDK mock (MOCKED MODE) -------------------------------------

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
      select: vi.fn(() => makeSelectChain([])),
      insert: vi.fn(() => ({ values: vi.fn() })),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    },
  };
});

// --- Telemetry mock --------------------------------------------------------

vi.mock("@/lib/jarvis/log-event", () => ({
  logJarvisEvent: logJarvisEventMock,
}));

// --- Executor mock (don't exercise real Drizzle paths) --------------------

vi.mock("@/lib/jarvis/executor", () => ({
  createServerExecutor: () => ({
    createTask: executorCreateTaskMock,
    createCapture: executorCreateCaptureMock,
    createEvent: executorCreateEventMock,
    rememberFact: vi.fn(async () => ({ ok: true, id: "fact:test", receipt: {} })),
    askClarification: vi.fn(async () => ({ ok: true, id: "clarification:test", receipt: {} })),
  }),
}));

// --- Facts mock -----------------------------------------------------------

vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: vi.fn(async () => []),
}));

// --- Anthropic API key env var -------------------------------------------

process.env.ANTHROPIC_API_KEY = "test-key-for-implicit-intent";

// ---------------------------------------------------------------------------
// Imports under test (post-mock)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/jarvis/route";
import {
  IMPLICIT_INTENT_FIXTURES,
  type ImplicitIntentFixture,
} from "./jarvis-implicit-intent.fixtures";

// ---------------------------------------------------------------------------
// Env gate: LIVE mode is handled in a separate file
// ---------------------------------------------------------------------------

const LIVE = process.env.ANTHROPIC_LIVE === "true";
const USER_A = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Mock harness helpers (mirrors jarvis-route.test.ts exactly)
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
 * contentBlock handler in sequence with each pre-canned block.
 * VERBATIM copy of the helper in jarvis-route.test.ts (lines 144-195).
 */
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
        usage: opts.usage ?? {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 80,
        },
        content: [],
      };
    },
  };
  return stream;
}

/**
 * Read all SSE events from a Response stream.
 * VERBATIM copy of the helper in jarvis-route.test.ts (lines 197-219).
 */
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
      const eventName = chunk.match(/^event: (\w+)$/m)?.[1] ?? "";
      const dataLine = chunk.match(/^data: (.+)$/m)?.[1] ?? "null";
      events.push({ event: eventName, data: JSON.parse(dataLine) });
      i = buffer.indexOf("\n\n");
    }
  }
  return events;
}

/**
 * Build a NextRequest from a body object.
 * VERBATIM copy of the helper in jarvis-route.test.ts (lines 221-232).
 */
function buildRequest(body: unknown) {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  return new Request("http://localhost:3000/api/jarvis", init);
}

// ---------------------------------------------------------------------------
// Dispatched action shape
// ---------------------------------------------------------------------------

interface DispatchedAction {
  name: "create_task" | "create_capture" | "create_event" | "remember_fact" | "ask_clarification";
  input: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Default test setup (mirrors jarvis-route.test.ts)
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_A } },
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("implicit-intent fidelity (JARVIS-22, D-P4)", () => {
  it("fixture corpus has 20 paired entries with valid structure", () => {
    expect(IMPLICIT_INTENT_FIXTURES.length).toBe(20);
    for (const f of IMPLICIT_INTENT_FIXTURES) {
      expect(f.description).toBeTruthy();
      expect(f.fragmented).toBeTruthy();
      expect(f.explicit).toBeTruthy();
      expect(f.expectedTools.length).toBeGreaterThan(0);
      for (const t of f.expectedTools) {
        expect(["create_task", "create_capture", "create_event"]).toContain(t.name);
        expect(Object.keys(t.keyFields).length).toBeGreaterThan(0);
      }
    }
  });

  // MOCKED MODE (default): assert the route dispatcher correctly emits the
  // expected tool_use blocks when the Anthropic SDK is mocked to return them.
  // This verifies the wire/dispatch pipeline is sound — NOT model quality.
  describe.skipIf(LIVE)("mocked mode — dispatcher regression (structurally equivalent dispatch paths)", () => {
    for (const f of IMPLICIT_INTENT_FIXTURES) {
      it(`dispatches expected tools for: ${f.description}`, async () => {
        const dispatched = await runScriptedTurn(f.fragmented, f.expectedTools);
        expect(dispatched.map((d) => d.name).sort()).toEqual(
          f.expectedTools.map((t) => t.name).sort(),
        );
      });
    }
  });

  // LIVE MODE (ANTHROPIC_LIVE=true): hit the real model with both phrasings;
  // assert ≥ 95% structural equivalence across the 20-pair set.
  // This is the JARVIS-22 acceptance assertion — gate behind env flag.
  describe.skipIf(!LIVE)("live mode — structural equivalence (JARVIS-22 acceptance)", () => {
    it("≥ 95% of fixture pairs produce structurally equivalent action sets", async () => {
      let pairwiseHits = 0;
      for (const f of IMPLICIT_INTENT_FIXTURES) {
        // runLiveTurn is only available in the live test file — throw if attempted here
        const fragActions = await runLiveTurn(f.fragmented);
        const explActions = await runLiveTurn(f.explicit);
        if (toolsStructurallyEqual(fragActions, explActions, f.expectedTools)) {
          pairwiseHits++;
        }
      }
      expect(pairwiseHits / IMPLICIT_INTENT_FIXTURES.length).toBeGreaterThanOrEqual(0.95);
    }, 600_000); // 10 min timeout for 40 live API calls
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * MOCKED MODE — scripts the Anthropic stream to emit `scripted` as tool_use blocks,
 * POSTs to the real route handler, and returns every dispatched action observed on
 * the SSE `event: action` channel.
 *
 * Implementation follows the Phase 5 jarvis-route.test.ts mock harness pattern
 * (lines 285-289). Uses anthropicStreamMock.mockReturnValue(buildAnthropicStream(...)).
 */
async function runScriptedTurn(
  input: string,
  scripted: ImplicitIntentFixture["expectedTools"],
): Promise<DispatchedAction[]> {
  // 1. Build MockBlock[] from scripted. For each expected tool, synthesize a
  //    minimal input object satisfying its keyFields (field → regex/string).
  //    Pass toolName so required fields (e.g. create_event start/end) are injected.
  const blocks: MockBlock[] = scripted.map((t, i) => ({
    type: "tool_use",
    id: `tu_${i}`,
    name: t.name,
    input: synthesizeInputFromKeyFields(t.keyFields, t.name),
  }));

  // 2. Wire the Anthropic SDK mock to return our scripted stream.
  anthropicStreamMock.mockReturnValue(buildAnthropicStream({ blocks }));

  // 3. Stub executor methods to return ok receipts (no DB writes).
  const baseOk = (idPrefix: string) =>
    vi.fn().mockResolvedValue({
      ok: true,
      id: `${idPrefix}-mock`,
      receipt: {},
    });
  executorCreateTaskMock.mockImplementation(baseOk("task"));
  executorCreateCaptureMock.mockImplementation(baseOk("capture"));
  executorCreateEventMock.mockImplementation(baseOk("event"));

  // 4. POST via the real route handler and collect SSE events.
  const res = await POST(buildRequest({ input, history: [] }) as never);
  const events = await readSseEvents(res);

  // 5. Filter event: action payloads → dispatched actions.
  return events
    .filter((e) => e.event === "action")
    .map((e) => {
      const d = e.data as { name: string; input: Record<string, unknown> };
      return { name: d.name as DispatchedAction["name"], input: d.input };
    });
}

// ISO datetime placeholder used for create_event required fields when the
// fixture's keyFields don't specify start/end. Must satisfy z.iso.datetime().
const EVENT_PLACEHOLDER_START = "2026-05-17T09:00:00+00:00";
const EVENT_PLACEHOLDER_END = "2026-05-17T10:00:00+00:00";

/**
 * Synthesize a minimal tool input from a fixture's keyFields object. Each entry
 * is `field → regex|string`. For regex, yield a value the regex will match;
 * for strings, use the literal value.
 *
 * For `create_event`, inject placeholder `start`/`end` ISO strings when the
 * fixture doesn't specify them — otherwise Zod validation in the route rejects
 * the scripted block and emits an `error` event instead of `action`.
 */
function synthesizeInputFromKeyFields(
  keyFields: Record<string, string | RegExp>,
  toolName?: "create_task" | "create_capture" | "create_event",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // Inject required-field defaults BEFORE user keyFields so user values win.
  if (toolName === "create_event") {
    out.start = EVENT_PLACEHOLDER_START;
    out.end = EVENT_PLACEHOLDER_END;
  }

  for (const [field, match] of Object.entries(keyFields)) {
    if (match instanceof RegExp) {
      // Extract the first literal alternative from the regex source.
      const source = match.source.replace(/^\^|\$$/g, "");
      const firstAlt = source
        .split("|")[0]!
        .replace(/[\\()?*+{}\[\]]/g, "")
        .replace(/\.\*/g, "x")
        .replace(/\?/g, "");
      out[field] = firstAlt || "x";
    } else {
      out[field] = match;
    }
  }
  return out;
}

/**
 * LIVE MODE stub — must only be called from jarvis-implicit-intent.live.test.ts,
 * which does NOT install the SDK mock. This stub throws if accidentally called
 * in mocked mode (prevents silent no-ops in the test suite).
 */
async function runLiveTurn(_input: string): Promise<DispatchedAction[]> {
  throw new Error(
    "runLiveTurn must be called only from jarvis-implicit-intent.live.test.ts " +
      "(the file that does NOT install the SDK mock). Set ANTHROPIC_LIVE=true to run.",
  );
}

/**
 * Structural equivalence between two dispatched action sets, evaluated against
 * the fixture's expected shape. BOTH `a` and `b` must independently satisfy
 * `expected` — that is the 'fragmented ≡ explicit' assertion at the heart of
 * JARVIS-22.
 */
function toolsStructurallyEqual(
  a: DispatchedAction[],
  b: DispatchedAction[],
  expected: ImplicitIntentFixture["expectedTools"],
): boolean {
  return satisfies(a, expected) && satisfies(b, expected);
}

function satisfies(
  actions: DispatchedAction[],
  expected: ImplicitIntentFixture["expectedTools"],
): boolean {
  // 1. Multiset of tool names must match (order-independent, count-sensitive).
  const actualNames = actions.map((d) => d.name).sort();
  const expectedNames = expected.map((t) => t.name).sort();
  if (actualNames.length !== expectedNames.length) return false;
  for (let i = 0; i < actualNames.length; i++) {
    if (actualNames[i] !== expectedNames[i]) return false;
  }
  // 2. Each expected tool must find a matching dispatched tool (same name +
  //    every keyField satisfied). Match-and-consume so duplicate-tool fixtures
  //    (e.g. 3× create_event for gym Mon/Wed/Fri) don't double-count one action.
  const remaining = [...actions];
  for (const exp of expected) {
    const idx = remaining.findIndex(
      (act) => act.name === exp.name && keyFieldsMatch(act.input, exp.keyFields),
    );
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return true;
}

function keyFieldsMatch(
  input: Record<string, unknown>,
  keyFields: Record<string, string | RegExp>,
): boolean {
  for (const [field, match] of Object.entries(keyFields)) {
    const val = input[field];
    if (val === undefined || val === null) return false;
    // Date-shaped fields tolerate ±1 day drift (covers chrono pre-parser jitter).
    if (field === "start" || field === "end" || field === "due") {
      const expectedMs = Date.parse(typeof match === "string" ? match : "");
      const actualMs = Date.parse(String(val));
      if (!Number.isNaN(expectedMs) && !Number.isNaN(actualMs)) {
        if (Math.abs(actualMs - expectedMs) > 86_400_000) return false; // ±1 day
        continue;
      }
    }
    if (match instanceof RegExp) {
      if (!match.test(String(val))) return false;
    } else {
      if (String(val) !== String(match)) return false;
    }
  }
  return true;
}
