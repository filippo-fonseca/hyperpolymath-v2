/**
 * turn-abort-clean-end — a DELIBERATE turn abort is a clean end, not an error.
 *
 * When a voice turn is barged-in / stopped, the server aborts the Anthropic
 * stream (upstream.abort()). The SDK then throws an APIUserAbortError whose
 * `.name` is "Error" (NOT "AbortError"), so the old name-only guard misfired and
 * `opts.onError` persisted a spurious status:"error" turn ("Request was
 * aborted.") that rendered as a failed bubble on reload. run-turn now treats an
 * abort (SDK APIUserAbortError OR the turn's abort signal being set) as a clean
 * end and skips onError, so the transcript route's error-persistence never runs.
 *
 * Everything the turn touches before the stream is mocked inert (DB, Anthropic
 * client, reference resolution, event log) so the test exercises the real
 * outer-catch classification.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { APIUserAbortError } from "@anthropic-ai/sdk";

// ---- inert DB: a chainable proxy that awaits to [] and has .catch ----------
function makeChain(): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve([]);
        if (prop === "catch") return () => Promise.resolve([]);
        return () => proxy;
      },
    }
  );
  return proxy;
}
vi.mock("@/lib/db", () => ({ db: { select: () => makeChain() } }));
vi.mock("@/lib/db/queries/jarvis-facts", () => ({
  getJarvisFactsForUser: async () => [],
}));
vi.mock("@/lib/jarvis/resolve-references", () => ({
  buildReferencedEntitiesBlock: async () => "",
}));
vi.mock("@/lib/jarvis/log-event", () => ({ logJarvisEvent: vi.fn() }));

// ---- Anthropic client mock: stream whose finalMessage() throws -------------
// The thrown error + whether the caller's abort signal fires is driven per-test.
let streamBehavior: (signal: AbortSignal) => Promise<never> = async () => {
  throw new Error("unset");
};
vi.mock("@/lib/jarvis/anthropic-client", () => ({
  JARVIS_MODEL: "claude-sonnet-4-6",
  getAnthropicClient: () => ({
    messages: {
      stream: (_params: unknown, opts: { signal: AbortSignal }) => ({
        on: () => {},
        finalMessage: () => streamBehavior(opts.signal),
      }),
    },
  }),
}));

import { runJarvisTurnStream, type RunTurnOptions } from "@/lib/jarvis/run-turn";

function makeOpts(over: Partial<RunTurnOptions> = {}): RunTurnOptions {
  return {
    userId: "user-1",
    apiKey: "sk-test",
    input: "what's on my plate today",
    isVoice: true,
    sttDoneAt: null,
    vadEndAt: undefined,
    onTextDelta: vi.fn(),
    onAction: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  streamBehavior = async () => {
    throw new Error("unset");
  };
});

describe("run-turn — deliberate abort is a clean end", () => {
  it("does NOT call onError when the SDK throws APIUserAbortError", async () => {
    streamBehavior = async () => {
      throw new APIUserAbortError();
    };
    const opts = makeOpts();
    await runJarvisTurnStream(opts);
    // No error turn is persisted downstream because onError never fires.
    expect(opts.onError).not.toHaveBeenCalled();
    expect(opts.onDone).not.toHaveBeenCalled();
  });

  it("does NOT call onError when the turn's abort signal is set (any error shape)", async () => {
    // Simulate barge-in: the caller aborts mid-stream, then a generic error is
    // thrown as the stream unwinds. The signal branch must catch it.
    const controller = new AbortController();
    streamBehavior = async () => {
      controller.abort(); // fires upstream.abort() via run-turn's listener
      throw new Error("Request was aborted.");
    };
    const opts = makeOpts({ abortSignal: controller.signal });
    await runJarvisTurnStream(opts);
    expect(opts.onError).not.toHaveBeenCalled();
  });

  it("STILL calls onError for a genuine (non-abort) failure", async () => {
    streamBehavior = async () => {
      throw new Error("upstream 500");
    };
    const opts = makeOpts();
    await runJarvisTurnStream(opts);
    expect(opts.onError).toHaveBeenCalledWith("upstream 500");
  });
});
