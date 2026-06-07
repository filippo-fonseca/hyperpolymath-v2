/**
 * Phase 11 / CACHE-04 (D-03) — POST /api/jarvis/warm predictive warmer.
 *
 * Covers the warm endpoint contract:
 *
 *   1. unauthenticated → 401 (no Anthropic call)
 *   2. first call (lastWarmAt=null) fires Anthropic with max_tokens=1, NO
 *      snapshot block appended to system, messages=[{ role:"user", content:"warm" }]
 *   3. second call within 50min age-gate → 204 (Anthropic NOT called)
 *   4. second call after 50min age-gate → 200 + Anthropic called
 *   5. successful warm returns { cacheRead, cacheCreate } AND bumps lastWarmAt
 *   6. Anthropic error surfaces as 500 (handler does NOT throw past response)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClaimsMock,
  anthropicCreateMock,
  getLastWarmAtMock,
  setLastWarmAtMock,
  dbState,
} = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  anthropicCreateMock: vi.fn(),
  getLastWarmAtMock: vi.fn(),
  setLastWarmAtMock: vi.fn(),
  dbState: { selectReturns: [] as unknown[][] },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims: getClaimsMock } })),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { create: anthropicCreateMock };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

vi.mock("@/lib/db", () => {
  function makeSelectChain(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(rows);
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return chain;
  }
  return {
    db: {
      select: vi.fn(() => {
        const rows = dbState.selectReturns.shift() ?? [];
        return makeSelectChain(rows);
      }),
    },
  };
});

vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: vi.fn(async () => []),
}));

vi.mock("@/lib/jarvis/state-snapshot-cache", () => ({
  getLastWarmAt: getLastWarmAtMock,
  setLastWarmAt: setLastWarmAtMock,
}));

process.env.ANTHROPIC_API_KEY = "test-key-for-warm-route";

import { POST } from "@/app/api/jarvis/warm/route";

const USER_A = "11111111-1111-1111-1111-111111111111";

function buildRequest() {
  return new Request("http://localhost:3000/api/jarvis/warm", {
    method: "POST",
  });
}

function buildSuccessResult(usage: {
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}) {
  return {
    id: "msg_warm_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: " " }],
    stop_reason: "max_tokens",
    usage: {
      input_tokens: 4000,
      output_tokens: 1,
      ...usage,
    },
  };
}

function seedDb() {
  // Two pre-loads per request — projects + user-row. Order matches the warm
  // route's Promise.all (see route.ts).
  dbState.selectReturns.push([]); // projects.list
  dbState.selectReturns.push([{ timezone: "America/New_York" }]); // user-row
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectReturns = [];
  getLastWarmAtMock.mockReturnValue(null);
  setLastWarmAtMock.mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/jarvis/warm — predictive cache warmer", () => {
  it("unauthenticated returns 401 without firing Anthropic", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: new Error("no jwt") });

    const res = await POST(buildRequest() as never);

    expect(res.status).toBe(401);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("first call fires Anthropic with max_tokens=1 and no snapshot block in system", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: USER_A } },
      error: null,
    });
    getLastWarmAtMock.mockReturnValue(null);
    seedDb();
    anthropicCreateMock.mockResolvedValue(
      buildSuccessResult({
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 4200,
      }),
    );

    const res = await POST(buildRequest() as never);

    expect(res.status).toBe(200);
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
    const call = anthropicCreateMock.mock.calls[0]![0] as {
      max_tokens: number;
      system: Array<{ type: string; text?: string }>;
      tools: unknown[];
      messages: Array<{ role: string; content: string }>;
    };

    expect(call.max_tokens).toBe(1);
    expect(call.messages).toEqual([{ role: "user", content: "warm" }]);
    // NO snapshot block — every system entry must come from buildSystemPrompt
    // (system + facts + voice addendum). The snapshot block uses a distinctive
    // <user_state opening token; assert it is absent.
    const systemText = call.system
      .map((b) => b.text ?? "")
      .join("\n");
    expect(systemText).not.toMatch(/<user_state\b/);
    // Tools must be present (we are warming tier 1 + tier 2).
    expect(call.tools.length).toBeGreaterThan(0);
  });

  it("second call within 50min age-gate returns 204 without firing Anthropic", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: USER_A } },
      error: null,
    });
    // 30 min ago — inside the 50 min gate window.
    getLastWarmAtMock.mockReturnValue(Date.now() - 30 * 60 * 1000);

    const res = await POST(buildRequest() as never);

    expect(res.status).toBe(204);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
    expect(setLastWarmAtMock).not.toHaveBeenCalled();
  });

  it("second call after 50min age-gate fires Anthropic", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: USER_A } },
      error: null,
    });
    // 51 min ago — outside the 50 min gate window.
    getLastWarmAtMock.mockReturnValue(Date.now() - 51 * 60 * 1000);
    seedDb();
    anthropicCreateMock.mockResolvedValue(
      buildSuccessResult({
        cache_read_input_tokens: 4200,
        cache_creation_input_tokens: 0,
      }),
    );

    const res = await POST(buildRequest() as never);

    expect(res.status).toBe(200);
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
  });

  it("successful warm returns cache metrics + bumps lastWarmAt", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: USER_A } },
      error: null,
    });
    getLastWarmAtMock.mockReturnValue(null);
    seedDb();
    anthropicCreateMock.mockResolvedValue(
      buildSuccessResult({
        cache_read_input_tokens: 3300,
        cache_creation_input_tokens: 900,
      }),
    );

    const before = Date.now();
    const res = await POST(buildRequest() as never);
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { cacheRead: number; cacheCreate: number };
    expect(body.cacheRead).toBe(3300);
    expect(body.cacheCreate).toBe(900);

    expect(setLastWarmAtMock).toHaveBeenCalledTimes(1);
    const [userIdArg, tsArg] = setLastWarmAtMock.mock.calls[0]! as [string, number];
    expect(userIdArg).toBe(USER_A);
    expect(tsArg).toBeGreaterThanOrEqual(before);
    expect(tsArg).toBeLessThanOrEqual(after);
  });

  it("Anthropic error surfaces as 500 — handler does NOT throw past the response", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: USER_A } },
      error: null,
    });
    getLastWarmAtMock.mockReturnValue(null);
    seedDb();
    anthropicCreateMock.mockRejectedValue(new Error("anthropic boom"));

    const res = await POST(buildRequest() as never);

    expect(res.status).toBe(500);
    // setLastWarmAt MUST NOT be called when the upstream Anthropic call fails —
    // we want the next user gesture to retry.
    expect(setLastWarmAtMock).not.toHaveBeenCalled();
  });
});
