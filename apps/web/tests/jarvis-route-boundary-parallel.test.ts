/**
 * Phase 10 / LAT-04 — JARVIS Route-Boundary Parallelization Regression Suite.
 *
 * Locks in the wall-clock guarantee created by collapsing the three sequential
 * `userProjects` → `userRows` → `userFacts` awaits into a single Promise.all
 * (see apps/web/app/api/jarvis/route.ts, "4. Load user context" block).
 *
 * Three tests:
 *   1. Timing — when all three DB-layer calls stall for 50ms each, the total
 *      route-boundary block resolves in well under the sequential floor
 *      (3 × 50ms = 150ms). Parallel ceiling: 100ms (50ms parallel + ≤50ms
 *      jitter for jsdom + executor stubs).
 *   2. Destructure order — when each mock returns a distinctly shaped payload,
 *      buildSystemPrompt receives projects=projects payload and facts=facts
 *      payload (i.e. not crossed-wires). Verified via spying on
 *      `@hyperpolymath/jarvis-core` `buildSystemPrompt`.
 *   3. Source-level regression guard — reads route.ts off disk and asserts
 *      exactly one `const [userProjects, userRows, userFacts] = await Promise.all`
 *      remains in the file. Catches a future PR that splits the Promise.all
 *      back into sequential awaits.
 *
 * Mocking strategy mirrors apps/web/tests/jarvis-route.test.ts so the harness
 * stays familiar; this file adds per-mock delay injection for Test 1.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks + per-test state
// ---------------------------------------------------------------------------

const {
  getClaimsMock,
  anthropicStreamMock,
  logJarvisEventMock,
  buildSystemPromptMock,
  buildToolDefinitionsMock,
  getJarvisFactsForUserMock,
  dbState,
} = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  anthropicStreamMock: vi.fn(),
  logJarvisEventMock: vi.fn(async () => undefined),
  buildSystemPromptMock: vi.fn(() => "stubbed-system-prompt"),
  buildToolDefinitionsMock: vi.fn(() => []),
  getJarvisFactsForUserMock: vi.fn(),
  dbState: {
    /**
     * Per-call queue of payloads for db.select(). Each `select()` invocation
     * shifts one entry. An entry shaped { delayMs, rows } resolves after the
     * given delay; a bare array resolves immediately.
     */
    selectQueue: [] as Array<{ delayMs?: number; rows: unknown[] }>,
  },
}));

// --- Supabase server mock --------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

// --- Anthropic SDK mock (we don't exercise the LLM path) -------------------

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { stream: anthropicStreamMock };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

// --- DB mock — per-call delay injection ------------------------------------
//
// makeSelectChain returns a thenable + chainable shape so callers can await
// either `db.select(...).from(...).where(...)` (projects query) OR
// `...limit(1)` (users query). Both paths resolve to the queued rows after
// the queued delay.

vi.mock("@/lib/db", () => {
  function makeSelectChain(entry: { delayMs?: number; rows: unknown[] }) {
    const settle = () =>
      entry.delayMs && entry.delayMs > 0
        ? new Promise<unknown[]>((r) => setTimeout(() => r(entry.rows), entry.delayMs))
        : Promise.resolve(entry.rows);
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn(() => settle());
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
      settle().then(resolve);
    return chain;
  }
  return {
    db: {
      select: vi.fn(() => {
        const entry = dbState.selectQueue.shift() ?? { rows: [] };
        return makeSelectChain(entry);
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

// --- Executor mock (we don't exercise real Drizzle paths) ------------------

vi.mock("@/lib/jarvis/executor", () => ({
  createServerExecutor: () => ({
    createTask: vi.fn(async () => ({ ok: true, id: "task", receipt: {} })),
    createCapture: vi.fn(async () => ({ ok: true, id: "cap", receipt: {} })),
    createEvent: vi.fn(async () => ({ ok: true, id: "ev", receipt: {} })),
    rememberFact: vi.fn(async () => ({ ok: true, id: "fact", receipt: {} })),
    askClarification: vi.fn(async () => ({
      ok: true,
      id: "clarification",
      receipt: {},
    })),
  }),
}));

// --- jarvis-facts mock — controllable delay --------------------------------

vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: (...args: unknown[]) =>
    getJarvisFactsForUserMock(...args),
}));

// --- jarvis-core mock — spy on buildSystemPrompt to assert destructure order
//
// Re-export the real schemas + factories so route.ts continues to parse and
// validate against them; only the prompt + tool builders are stubbed.

vi.mock("@hyperpolymath/jarvis-core", async () => {
  const actual =
    await vi.importActual<typeof import("@hyperpolymath/jarvis-core")>(
      "@hyperpolymath/jarvis-core",
    );
  return {
    ...actual,
    buildSystemPrompt: buildSystemPromptMock,
    buildToolDefinitions: buildToolDefinitionsMock,
  };
});

// --- Anthropic API key env var ---------------------------------------------

process.env.ANTHROPIC_API_KEY = "test-key-for-parallelization";

// ---------------------------------------------------------------------------
// Imports under test (post-mock)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/jarvis/route";

const USER_A = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Minimal Anthropic stream stub — resolves immediately with no blocks
// ---------------------------------------------------------------------------

function buildEmptyStream() {
  const handlers: Record<string, Array<(arg: unknown) => void | Promise<void>>> =
    {};
  return {
    on(event: string, cb: (arg: unknown) => void | Promise<void>) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
      return this;
    },
    async finalMessage() {
      return {
        id: "msg_parallel_test",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      };
    },
  };
}

async function drain(response: Response): Promise<void> {
  const reader = response.body!.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

function buildRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/jarvis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectQueue = [];
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_A } },
    error: null,
  });
  anthropicStreamMock.mockReturnValue(buildEmptyStream());
  buildSystemPromptMock.mockReturnValue("stubbed-system-prompt");
  buildToolDefinitionsMock.mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("Phase 10 / LAT-04 — JARVIS route-boundary parallelization", () => {
  it("fires user-context queries concurrently (Promise.all) — wall-clock < sequential floor", async () => {
    const DELAY_MS = 50;
    // Queue: projects query → users query (each delayed 50ms in the DB mock).
    dbState.selectQueue.push({ delayMs: DELAY_MS, rows: [] });
    dbState.selectQueue.push({
      delayMs: DELAY_MS,
      rows: [{ timezone: "America/New_York", defaultCalendarId: null }],
    });
    // Facts query also delayed 50ms.
    getJarvisFactsForUserMock.mockImplementation(
      () => new Promise((r) => setTimeout(() => r([]), DELAY_MS)),
    );

    const start = Date.now();
    const res = await POST(buildRequest({ input: "hi", history: [] }) as never);
    await drain(res);
    const elapsed = Date.now() - start;

    // Sequential floor (pre-LAT-04): 3 × 50ms = 150ms minimum just for the
    // three user-context awaits. Promise.all should land near 50ms; allow
    // a 100ms ceiling for jsdom + Anthropic-stub + SSE setup jitter. If this
    // test starts failing the parallel guarantee has been broken — DO NOT
    // raise the ceiling past ~120ms without locking the rationale inline.
    expect(elapsed).toBeLessThan(100);
  });

  it("destructure order matches downstream consumers (projects → projects, facts → facts)", async () => {
    const PROJECTS = [
      { id: "p1", name: "Project One", icon: null },
      { id: "p2", name: "Project Two", icon: "📚" },
    ];
    const USERS = [{ timezone: "Europe/Paris", defaultCalendarId: "cal-xyz" }];
    const FACTS = [
      { type: "preference", key: "voice", value: "butler" },
      { type: "identity", key: "name", value: "Filippo" },
    ];

    dbState.selectQueue.push({ rows: PROJECTS });
    dbState.selectQueue.push({ rows: USERS });
    getJarvisFactsForUserMock.mockResolvedValueOnce(FACTS);

    const res = await POST(buildRequest({ input: "hi", history: [] }) as never);
    await drain(res);

    // buildSystemPrompt is called exactly once with { projects, facts, voiceActive }.
    // Assert that destructured `userProjects` → projects arg, and that
    // destructured `userFacts` → facts arg (not crossed-wires).
    expect(buildSystemPromptMock).toHaveBeenCalledTimes(1);
    // buildSystemPromptMock is declared via `vi.fn(() => "...")` so its
    // inferred .mock.calls tuple is empty — widen via unknown for the assert.
    const callsAny = buildSystemPromptMock.mock.calls as unknown as unknown[][];
    const call = callsAny[0]?.[0] as {
      projects: Array<{ id: string; name: string; icon: string | null }>;
      facts: Array<{ type: string; key: string; value: string }>;
      voiceActive: boolean;
    };
    expect(call.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(call.projects.map((p) => p.name)).toEqual([
      "Project One",
      "Project Two",
    ]);
    expect(call.facts.map((f) => f.key)).toEqual(["voice", "name"]);
    // Sanity: projects payload is NOT what landed in the facts slot.
    expect(call.facts).not.toEqual(PROJECTS);
    // Sanity: facts payload is NOT what landed in the projects slot.
    expect(call.projects).not.toEqual(FACTS);
  });

  it("route.ts source still uses a single Promise.all in the route-boundary block (regression guard)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/jarvis/route.ts"),
      "utf8",
    );
    // The exact destructure shape produced by Plan 10-01 Task 1. Anyone who
    // splits this back into sequential awaits would delete this line and
    // this assertion would fail.
    const promiseAllMatches = src.match(
      /const \[userProjects, userRows, userFacts\] = await Promise\.all/g,
    );
    expect(promiseAllMatches).not.toBeNull();
    expect(promiseAllMatches?.length).toBe(1);

    // Additionally: between the start of `4. Load user context` and the
    // `const projectSummaries` line that consumes userProjects, there must
    // be ZERO standalone `await db` calls. (Promise.all wrappers don't
    // match because the body inside Promise.all is `db.select(...)` not
    // `await db.select(...)`.)
    const boundaryStart = src.indexOf("4. Load user context");
    const boundaryEnd = src.indexOf("const projectSummaries");
    expect(boundaryStart).toBeGreaterThan(-1);
    expect(boundaryEnd).toBeGreaterThan(boundaryStart);
    const boundaryBlock = src.slice(boundaryStart, boundaryEnd);
    const awaitDbMatches = boundaryBlock.match(/await db/g);
    expect(awaitDbMatches).toBeNull();
    const awaitFactsMatches = boundaryBlock.match(/await getJarvisFactsForUser/g);
    expect(awaitFactsMatches).toBeNull();
  });
});
