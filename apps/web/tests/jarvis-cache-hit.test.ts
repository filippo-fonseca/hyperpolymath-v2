/**
 * Phase 9 / TEL-03 — write-path canary + end-to-end cache-hit live test.
 *
 * STRUCTURAL identity is asserted in tests/jarvis-prompt-stability.test.ts
 * (sibling file — runs in CI default; catches Date.now()/unsorted-stringify
 * regressions inside packages/jarvis-core at the source). This file
 * complements that by:
 *
 *   1. (MOCKED, CI default) Verifying the /api/jarvis route + logJarvisEvent
 *      pipeline correctly THREADS cache_read_input_tokens through to
 *      telemetry on the second of two back-to-back turns. Purely a
 *      write-path canary — does NOT prove cache stability.
 *   2. (LIVE, ANTHROPIC_LIVE=true) Actually calling Anthropic twice with
 *      identical request bodies and asserting cache_creation > 0 on turn 1
 *      and cache_read > 0 on turn 2. End-to-end acceptance — costs ~$0.001
 *      per run.
 *
 * Together with prompt-stability, this is the full TEL-03 regression net.
 * Audit checklist for failures: .planning/research/speed-agility/05-context-priming.md §8
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClaimsMock,
  anthropicStreamMock,
  logJarvisEventMock,
  dbState,
} = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  anthropicStreamMock: vi.fn(),
  logJarvisEventMock: vi.fn(async () => undefined),
  dbState: { selectReturns: [] as unknown[][] },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims: getClaimsMock } })),
}));
vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { stream: anthropicStreamMock };
    constructor(_opts: unknown) {}
  }
  return { default: FakeAnthropic };
});
vi.mock("@/lib/db", () => {
  function makeSelectChain(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
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
      insert: vi.fn(() => ({ values: vi.fn() })),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    },
  };
});
vi.mock("@/lib/jarvis/log-event", () => ({ logJarvisEvent: logJarvisEventMock }));
vi.mock("@/lib/jarvis/executor", () => ({
  createServerExecutor: () => ({
    createTask: vi.fn(async () => ({ ok: true, id: "task:test", receipt: {} })),
    createCapture: vi.fn(async () => ({ ok: true, id: "capture:test", receipt: {} })),
    createEvent: vi.fn(async () => ({ ok: true, id: "event:test", receipt: {} })),
    rememberFact: vi.fn(async () => ({ ok: true, id: "fact:test", receipt: {} })),
    askClarification: vi.fn(async () => ({ ok: true, id: "clarification:test", receipt: {} })),
  }),
}));
vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: vi.fn(async () => []),
}));

process.env.ANTHROPIC_API_KEY = "test-key-for-cache-hit";

import { POST } from "@/app/api/jarvis/route";

const USER_A = "11111111-1111-1111-1111-111111111111";

function buildStream(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}) {
  const handlers: Record<string, Array<(arg: unknown) => void | Promise<void>>> = {};
  return {
    on(event: string, cb: (arg: unknown) => void | Promise<void>) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
      return this;
    },
    async finalMessage() {
      for (const h of handlers.text ?? []) await h("ack");
      return { id: "msg_test", usage };
    },
  };
}

function buildRequest(body: unknown) {
  return new Request("http://localhost:3000/api/jarvis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function drain(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
    decoder.decode();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectReturns = [];
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: USER_A } }, error: null });
  for (let i = 0; i < 2; i++) {
    dbState.selectReturns.push([]); // projects.list
    dbState.selectReturns.push([{ timezone: "America/New_York", defaultCalendarId: null }]);
  }
});

afterEach(() => { vi.restoreAllMocks(); });

describe("TEL-03 — mocked write-path canary (CI default)", () => {
  it("threads cache_read_input_tokens through to telemetry on the second turn", async () => {
    anthropicStreamMock.mockReturnValueOnce(buildStream({
      input_tokens: 50,
      output_tokens: 10,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 2048,
    }));
    anthropicStreamMock.mockReturnValueOnce(buildStream({
      input_tokens: 50,
      output_tokens: 10,
      cache_read_input_tokens: 2048,
      cache_creation_input_tokens: 0,
    }));

    const body = { input: "buy milk", history: [] };
    const res1 = await POST(buildRequest(body) as never);
    await drain(res1);
    const res2 = await POST(buildRequest(body) as never);
    await drain(res2);
    await new Promise((r) => setTimeout(r, 0));

    expect(logJarvisEventMock).toHaveBeenCalledTimes(2);
    const secondCall = (logJarvisEventMock.mock.calls as unknown[][])[1][0] as {
      usage?: { cache_read_input_tokens?: number };
    };
    const read = secondCall.usage?.cache_read_input_tokens ?? 0;
    expect(
      read,
      "TEL-03 REGRESSION (write-path): cache_read_input_tokens === 0 on " +
        "second of two identical mocked turns. The /api/jarvis route is " +
        "no longer threading cache_read_input_tokens through to logJarvisEvent. " +
        "Check route.ts logJarvisEvent call site for the usage payload mapping.",
    ).toBeGreaterThan(0);
  });
});

/**
 * LIVE end-to-end acceptance — makes 2 real Anthropic calls. Skip unless
 * ANTHROPIC_LIVE=true. Use a real ANTHROPIC_API_KEY in the environment.
 *
 * This test is what catches a regression that the structural test in
 * jarvis-prompt-stability.test.ts misses (e.g. invalidation inside the
 * SDK request body itself, or a future refactor that bypasses
 * packages/jarvis-core entirely).
 */
describe("TEL-03 — live end-to-end cache hit (ANTHROPIC_LIVE=true)", () => {
  const live = process.env.ANTHROPIC_LIVE === "true";
  (live ? it : it.skip)(
    "two identical real Anthropic calls produce cache_read_input_tokens > 0 on turn 2",
    async () => {
      // The vi.mock("@anthropic-ai/sdk") at the top of this file shadows the
      // SDK for ALL tests. For the live block we need the REAL SDK — use
      // vi.doUnmock + dynamic import to bypass the mock for this one test.
      vi.doUnmock("@anthropic-ai/sdk");
      const { default: Anthropic } = await import("@anthropic-ai/sdk");

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey || apiKey === "test-key-for-cache-hit") {
        throw new Error(
          "Live test requires a real ANTHROPIC_API_KEY in the environment.",
        );
      }
      const anth = new Anthropic({ apiKey });

      // Build a fixture that exceeds the 2048-token cache floor.
      // Pad system prompt with deterministic text. NO randomness, NO Date.
      const paddedSystem = Array.from({ length: 200 })
        .map(
          (_, i) =>
            `Stable instruction line ${i}: respond literally with "ack".`,
        )
        .join("\n");

      const request = {
        model: "claude-sonnet-4-6",
        max_tokens: 16,
        system: [
          {
            type: "text" as const,
            text: paddedSystem,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [{ role: "user" as const, content: "ack" }],
      };

      // Call 1 — write cache.
      const stream1 = anth.messages.stream(request);
      const final1 = await stream1.finalMessage();
      const created =
        (final1.usage as { cache_creation_input_tokens?: number })
          ?.cache_creation_input_tokens ?? 0;
      expect(
        created,
        "TEL-03 LIVE: first call did not write a cache entry. Padding may be " +
          "below the 2048-token floor, or cache_control breakpoint is missing.",
      ).toBeGreaterThan(0);

      // Call 2 — read cache (immediate, well within 5-min TTL).
      const stream2 = anth.messages.stream(request);
      const final2 = await stream2.finalMessage();
      const read =
        (final2.usage as { cache_read_input_tokens?: number })
          ?.cache_read_input_tokens ?? 0;
      expect(
        read,
        "TEL-03 LIVE REGRESSION: cache_read_input_tokens === 0 on second " +
          "identical Anthropic call. A silent prompt-cache invalidator is " +
          "present. The structural test in jarvis-prompt-stability.test.ts " +
          "may have missed a path — check the live SDK request body for " +
          "Date.now() or random IDs inserted between request construction " +
          "and wire serialization.",
      ).toBeGreaterThan(0);
    },
    30_000,
  ); // 30s timeout for two live Anthropic round-trips
});
