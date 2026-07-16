/**
 * routine-runner — unit tests (critical path).
 *
 * The runner is JARVIS's routine execution heart: it runs a routine's blocks
 * SEQUENTIALLY, each as one scoped agent turn through `runJarvisTurnStream`,
 * forcing the block's tool on that turn, threading each block's output forward
 * as a compact assistant note, stamping "routine" provenance, and isolating
 * per-block errors. These tests mock `runJarvisTurnStream` at the module
 * boundary (per CLAUDE.md: never the raw Anthropic SDK), driving its callbacks
 * so no Anthropic/DB is touched.
 *
 * Coverage:
 *  1. Sequencing — block N+1 not started until block N's onDone fires.
 *  2. Forced tool per block — toolChoice:{type:"tool",name:block.tool}, and the
 *     final message is the directive (+ params hint).
 *  3. Output threading — block 2 sees a compact summarized note from block 1,
 *     and the raw tool_result payload is NOT threaded verbatim.
 *  4. Provenance — every turn gets source.device === "routine".
 *  5. Error isolation — an errored block doesn't stop later blocks; onError
 *     fires with the right blockId; onRoutineDone still gets all results.
 *  6. Unknown-tool guard — a bogus tool is skipped, never reaching run-turn.
 *  7. Read+act contract — a block that fires read_gmail THEN create_task in one
 *     turn faithfully forwards BOTH actions (the routine crux).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RoutineBlock } from "@hyperpolymath/jarvis-core";

// ---- run-turn mock ---------------------------------------------------------
// Each queued driver receives the run-turn opts and drives its callbacks.
type TurnDriver = (opts: Record<string, unknown>) => void | Promise<void>;

const turnCalls: Array<Record<string, unknown>> = [];
let drivers: TurnDriver[] = [];
let defaultDriver: TurnDriver = (opts) => {
  (opts.onDone as (u: unknown) => void)({});
};

const runJarvisTurnStreamMock = vi.fn(async (opts: Record<string, unknown>) => {
  turnCalls.push(opts);
  const driver = drivers.length > 0 ? (drivers.shift() as TurnDriver) : defaultDriver;
  await driver(opts);
});

vi.mock("@/lib/jarvis/run-turn", () => ({
  runJarvisTurnStream: (opts: Record<string, unknown>) => runJarvisTurnStreamMock(opts),
}));

import {
  runRoutine,
  summarizeBlockForThread,
  validateBlockParams,
  buildSynthesisReceipts,
  GATHER_CONCURRENCY,
  type RoutineRunContext,
  type RoutineRunHandlers,
  type BlockRunResult,
} from "@/lib/jarvis/routine-runner";

function makeCtx(over: Partial<RoutineRunContext> = {}): RoutineRunContext {
  return {
    userId: "user-1",
    apiKey: "sk-test",
    source: { device: "routine", input: "voice" },
    isVoice: true,
    routineName: "Morning Brief",
    runId: "run-abc",
    ...over,
  };
}

function makeHandlers(): RoutineRunHandlers & {
  events: string[];
  errors: Array<{ blockId: string; message: string }>;
  done: BlockRunResult[] | null;
} {
  const events: string[] = [];
  const errors: Array<{ blockId: string; message: string }> = [];
  const h = {
    events,
    errors,
    done: null as BlockRunResult[] | null,
    onBlockStart: (blockId: string, i: number) => events.push(`start:${blockId}:${i}`),
    onTextDelta: (blockId: string, delta: string) => events.push(`delta:${blockId}:${delta}`),
    onAction: (blockId: string, _id: string, name: string) => events.push(`action:${blockId}:${name}`),
    onBlockDone: (r: BlockRunResult) => events.push(`blockdone:${r.blockId}`),
    onRoutineDone: (results: BlockRunResult[]) => {
      h.done = results;
      events.push("routinedone");
    },
    onError: (blockId: string, message: string) => {
      errors.push({ blockId, message });
      events.push(`error:${blockId}`);
    },
    // Option C (synthesis) handlers — tracked for the cohesion tests.
    onOpener: (text: string) => events.push(`opener:${text}`),
    onSynthesisStart: (turnId: string) => events.push(`synthstart:${turnId}`),
    onSynthesisDelta: (turnId: string, delta: string) => events.push(`synthdelta:${turnId}:${delta}`),
    onSynthesisDone: (turnId: string) => events.push(`synthdone:${turnId}`),
    // Gather-progress hooks (synthesize mode only, both paths).
    onGatherBlockStart: (blockId: string, i: number) => events.push(`gatherstart:${blockId}:${i}`),
    onGatherBlockDone: (r: BlockRunResult) => events.push(`gatherdone:${r.blockId}`),
  };
  return h;
}

// A driver that returns an unresolved promise until release() is called
// (settling onDone). Used to hold gather turns in-flight so concurrency is
// observable. `onStart` runs synchronously when the turn begins.
interface Deferred {
  driver: TurnDriver;
  release: () => void;
}
function deferredDriver(onStart?: (opts: Record<string, unknown>) => void): Deferred {
  const d: Deferred = { driver: () => {}, release: () => {} };
  d.driver = (opts) => {
    onStart?.(opts);
    return new Promise<void>((res) => {
      d.release = () => {
        (opts.onDone as (u: unknown) => void)({});
        res();
      };
    });
  };
  return d;
}

// Flush a few microtask ticks so pending .then callbacks run.
async function flush(n = 4): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

function block(tool: string, params: Record<string, unknown> = {}, nlDirective?: string): RoutineBlock {
  return { id: "", tool: tool as RoutineBlock["tool"], params, nlDirective };
}

beforeEach(() => {
  turnCalls.length = 0;
  drivers = [];
  defaultDriver = (opts) => (opts.onDone as (u: unknown) => void)({});
  runJarvisTurnStreamMock.mockClear();
});

describe("runRoutine — sequencing", () => {
  it("runs blocks in order, starting block N+1 only after block N settles", async () => {
    const order: string[] = [];
    // Block 0 resolves on a deferred tick; assert block 1 hasn't started yet.
    let releaseBlock0: () => void = () => {};
    drivers = [
      (opts) => {
        order.push("b0-start");
        return new Promise<void>((res) => {
          releaseBlock0 = () => {
            (opts.onDone as (u: unknown) => void)({});
            res();
          };
        });
      },
      (opts) => {
        order.push("b1-start");
        (opts.onDone as (u: unknown) => void)({});
      },
    ];

    const h = makeHandlers();
    const p = runRoutine(
      [block("get_weather"), block("read_gmail")],
      makeCtx(),
      h,
    );

    // Let block 0's driver register.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["b0-start"]); // block 1 not yet started
    expect(turnCalls).toHaveLength(1);

    releaseBlock0();
    await p;

    expect(order).toEqual(["b0-start", "b1-start"]);
    expect(turnCalls).toHaveLength(2);
  });
});

describe("runRoutine — forced tool + directive", () => {
  it("forces each block's tool and ends the message with the directive + params hint", async () => {
    const h = makeHandlers();
    await runRoutine(
      [block("read_gmail", { maxResults: 5 }, "check my inbox")],
      makeCtx(),
      h,
    );

    expect(turnCalls).toHaveLength(1);
    const opts = turnCalls[0];
    expect(opts.toolChoice).toEqual({ type: "tool", name: "read_gmail" });
    const messages = opts.messages as Array<{ role: string; content: string }>;
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toContain("check my inbox");
    expect(last.content).toContain("ROUTINE BLOCK PARAMS");
    expect(last.content).toContain("read_gmail");
    // input is the bare directive (telemetry).
    expect(opts.input).toBe("check my inbox");
  });
});

describe("runRoutine — output threading", () => {
  it("threads a compact summary of block 1 into block 2, not raw tool_result JSON", async () => {
    const bigPayload = { emails: Array.from({ length: 25 }, (_, i) => ({ id: i, body: "x".repeat(500) })) };
    drivers = [
      (opts) => {
        (opts.onTextDelta as (d: string) => void)("Found 3 unanswered emails from real people.");
        (opts.onAction as (id: string, n: string, r: unknown) => void)("tu-1", "read_gmail", bigPayload);
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => (opts.onDone as (u: unknown) => void)({}),
    ];

    const h = makeHandlers();
    await runRoutine([block("read_gmail"), block("get_weather")], makeCtx(), h);

    const secondMessages = turnCalls[1].messages as Array<{ role: string; content: string }>;
    // First message of block 2 is the threaded assistant note.
    const note = secondMessages[0];
    expect(note.role).toBe("assistant");
    expect(note.content).toContain("[Block read_gmail]");
    expect(note.content).toContain("unanswered emails");
    expect(note.content).toContain("actions: read_gmail");
    // The raw 25-email payload must NOT be threaded verbatim.
    expect(JSON.stringify(secondMessages)).not.toContain("x".repeat(500));
    // Compact: the note stays small.
    expect(note.content.length).toBeLessThan(600);
  });
});

describe("runRoutine — provenance", () => {
  it("stamps source.device='routine' on every turn", async () => {
    const h = makeHandlers();
    await runRoutine([block("get_weather"), block("read_gmail")], makeCtx(), h);
    for (const opts of turnCalls) {
      expect(opts.source).toEqual({ device: "routine", input: "voice" });
    }
  });

  it("uses input='text' provenance when isVoice is false", async () => {
    const h = makeHandlers();
    await runRoutine([block("get_weather")], makeCtx({ isVoice: false, source: { device: "routine", input: "text" } }), h);
    expect((turnCalls[0].source as { input: string }).input).toBe("text");
  });
});

describe("runRoutine — error isolation", () => {
  it("an errored block does not stop later blocks; onRoutineDone gets all results", async () => {
    drivers = [
      (opts) => (opts.onError as (m: string) => void)("gmail auth failed"),
      (opts) => {
        (opts.onTextDelta as (d: string) => void)("Sunny, 72F.");
        (opts.onDone as (u: unknown) => void)({});
      },
    ];

    const h = makeHandlers();
    const results = await runRoutine([block("read_gmail"), block("get_weather")], makeCtx(), h);

    expect(turnCalls).toHaveLength(2); // second block still ran
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0].message).toBe("gmail auth failed");
    expect(results).toHaveLength(2);
    expect(results[0].error).toBe("gmail auth failed");
    expect(results[1].text).toBe("Sunny, 72F.");
    expect(h.done).toHaveLength(2);
    expect(h.events).toContain("routinedone");
  });
});

describe("runRoutine — unknown-tool guard", () => {
  it("skips an unknown tool without ever calling run-turn", async () => {
    const h = makeHandlers();
    const results = await runRoutine(
      [block("not_a_tool"), block("get_weather")],
      makeCtx(),
      h,
    );

    // Only the valid block reached run-turn.
    expect(turnCalls).toHaveLength(1);
    expect((turnCalls[0].toolChoice as { name: string }).name).toBe("get_weather");
    expect(h.errors[0].blockId).toBe("run-abc:b0");
    expect(h.errors[0].message).toContain("unknown tool: not_a_tool");
    expect(results[0].error).toContain("unknown tool");
    expect(h.done).toHaveLength(2);
  });
});

describe("runRoutine — read+act contract (the crux)", () => {
  it("faithfully forwards a forced read_gmail followed by create_task in one block turn", async () => {
    drivers = [
      (opts) => {
        // Pass 1: forced read_gmail. Pass 2 (auto): model narrates + creates a task.
        (opts.onAction as (id: string, n: string, r: unknown) => void)("tu-read", "read_gmail", { emails: [] });
        (opts.onTextDelta as (d: string) => void)("One email needs a reply. Making a task.");
        (opts.onAction as (id: string, n: string, r: unknown) => void)("tu-task", "create_task", { id: "t-1" });
        (opts.onDone as (u: unknown) => void)({});
      },
    ];

    const h = makeHandlers();
    const results = await runRoutine(
      [block("read_gmail", {}, "if any email needs a reply, make a task for it")],
      makeCtx(),
      h,
    );

    const actions = results[0].actions.map((a) => a.name);
    expect(actions).toEqual(["read_gmail", "create_task"]);
    // Both surfaced through the handler too.
    expect(h.events).toContain("action:run-abc:b0:read_gmail");
    expect(h.events).toContain("action:run-abc:b0:create_task");
  });
});

describe("runRoutine — synthesis mode (Option C cohesion)", () => {
  it("suppresses per-block narration and emits EXACTLY ONE synthesis bus cycle for a 4-block briefing", async () => {
    // Each gather block streams its own narration + fires its tool. In synthesis
    // mode NONE of that narration reaches the bus; instead a single synthesis
    // turn speaks one cohesive brief.
    drivers = [
      (opts) => {
        (opts.onTextDelta as (d: string) => void)("Clear, 94F.");
        (opts.onAction as (id: string, n: string, r: unknown) => void)("tu-w", "get_weather", { tempF: 94 });
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => {
        (opts.onTextDelta as (d: string) => void)("Two headlines.");
        (opts.onAction as (id: string, n: string, r: unknown) => void)("tu-n", "get_news", { articles: [] });
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => {
        (opts.onTextDelta as (d: string) => void)("Just bots.");
        (opts.onAction as (id: string, n: string, r: unknown) => void)("tu-g", "read_gmail", { emails: [] });
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => {
        (opts.onTextDelta as (d: string) => void)("Tita, two messages.");
        (opts.onAction as (id: string, n: string, r: unknown) => void)("tu-wa", "read_whatsapp", { messages: [] });
        (opts.onDone as (u: unknown) => void)({});
      },
      // 5th call = the synthesis turn.
      (opts) => {
        (opts.onTextDelta as (d: string) => void)("Welcome home, sir. Clear ninety-four out. Tita left two messages — shall I reply?");
        (opts.onDone as (u: unknown) => void)({});
      },
    ];

    const h = makeHandlers();
    await runRoutine(
      [block("get_weather"), block("get_news"), block("read_gmail"), block("read_whatsapp")],
      makeCtx({ synthesize: true }),
      h,
    );

    // 4 gather turns + 1 synthesis turn.
    expect(turnCalls).toHaveLength(5);

    // Instant opener spoken on start.
    expect(h.events.filter((e) => e.startsWith("opener:"))).toHaveLength(1);

    // ZERO per-block narration reached the bus.
    expect(h.events.some((e) => e.startsWith("delta:"))).toBe(false);
    // No per-block start/done bus cycles either.
    expect(h.events.some((e) => e.startsWith("start:"))).toBe(false);
    expect(h.events.some((e) => e.startsWith("blockdone:"))).toBe(false);

    // EXACTLY ONE synthesis cycle, all under the SAME synthetic turnId.
    const starts = h.events.filter((e) => e.startsWith("synthstart:"));
    const dones = h.events.filter((e) => e.startsWith("synthdone:"));
    expect(starts).toHaveLength(1);
    expect(dones).toHaveLength(1);
    const synthTurnId = starts[0].slice("synthstart:".length);
    expect(synthTurnId).toBe("run-abc:brief");
    // Every synthesis delta carries that one turnId.
    const deltas = h.events.filter((e) => e.startsWith("synthdelta:"));
    expect(deltas.length).toBeGreaterThan(0);
    for (const d of deltas) {
      expect(d.startsWith(`synthdelta:${synthTurnId}:`)).toBe(true);
    }

    // Receipts still render on screen in BOTH modes — onAction fired per block.
    expect(h.events.filter((e) => e.startsWith("action:"))).toHaveLength(4);
  });

  it("the synthesis turn is prose-only (toolChoice none) under one turnId, gather turns are non-voice", async () => {
    drivers = [
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
    ];
    const h = makeHandlers();
    await runRoutine([block("get_weather")], makeCtx({ synthesize: true }), h);

    // turnCalls[0] = gather (non-voice), turnCalls[1] = synthesis turn.
    expect(turnCalls).toHaveLength(2);
    expect((turnCalls[0] as { isVoice: boolean }).isVoice).toBe(false);
    const synth = turnCalls[1];
    expect(synth.toolChoice).toEqual({ type: "none" });
    expect(synth.turnId).toBe("run-abc:brief");
    // Voice flag on the synthesis turn follows ctx.isVoice (true here).
    expect((synth as { isVoice: boolean }).isVoice).toBe(true);
    const msgs = synth.messages as Array<{ role: string; content: string }>;
    expect(msgs[0].content).toContain("gathered several data sources");
    expect(msgs[0].content).toContain("WEATHER:");
  });

  it("non-synthesis mode is unchanged: per-block narration streams, no synthesis cycle", async () => {
    drivers = [
      (opts) => {
        (opts.onTextDelta as (d: string) => void)("Clear, 94F.");
        (opts.onDone as (u: unknown) => void)({});
      },
    ];
    const h = makeHandlers();
    await runRoutine([block("get_weather")], makeCtx(), h);
    expect(turnCalls).toHaveLength(1); // no extra synthesis turn
    expect(h.events).toContain("delta:run-abc:b0:Clear, 94F.");
    expect(h.events.some((e) => e.startsWith("synthstart:"))).toBe(false);
    expect(h.events.some((e) => e.startsWith("opener:"))).toBe(false);
  });
});

describe("buildSynthesisReceipts", () => {
  it("labels each block by tool and includes narration + action names", () => {
    const results: BlockRunResult[] = [
      { blockId: "b0", tool: "get_weather", text: "Clear, 94F.", actions: [] },
      {
        blockId: "b1",
        tool: "read_gmail",
        text: "Just bots and marketing.",
        actions: [{ toolUseId: "1", name: "read_gmail", result: {} }],
      },
    ];
    const out = buildSynthesisReceipts(
      [block("get_weather"), block("read_gmail")],
      results,
    );
    expect(out).toContain("WEATHER: Clear, 94F.");
    expect(out).toContain("GMAIL: Just bots and marketing.");
    expect(out).toContain("[actions: read_gmail]");
  });

  it("marks an errored block as unavailable", () => {
    const results: BlockRunResult[] = [
      { blockId: "b0", tool: "read_gmail", text: "", actions: [], error: "auth failed" },
    ];
    const out = buildSynthesisReceipts([block("read_gmail")], results);
    expect(out).toContain("GMAIL: (unavailable — auth failed)");
  });
});

describe("helpers", () => {
  it("summarizeBlockForThread caps text and lists action names", () => {
    const note = summarizeBlockForThread({
      blockId: "b0",
      tool: "read_gmail",
      text: "y".repeat(1000),
      actions: [{ toolUseId: "1", name: "read_gmail", result: {} }],
    });
    expect(note.role).toBe("assistant");
    expect(note.content).toContain("…");
    expect(note.content).toContain("actions: read_gmail");
    expect(note.content.length).toBeLessThan(500);
  });

  it("validateBlockParams keeps raw params when they fail the tool schema", () => {
    const bad = validateBlockParams("create_task", { title: 123 }, true);
    expect(bad.invalid).toBe(true);
    expect(bad.value).toEqual({ title: 123 });
  });
});

describe("runRoutine — parallel gather (synthesize + parallel)", () => {
  it("runs gather blocks concurrently (all in flight before any settles)", async () => {
    const d0 = deferredDriver();
    const d1 = deferredDriver();
    const d2 = deferredDriver();
    drivers = [d0.driver, d1.driver, d2.driver];

    const h = makeHandlers();
    const p = runRoutine(
      [block("get_weather"), block("get_news"), block("read_gmail")],
      makeCtx({ synthesize: true, parallel: true }),
      h,
    );

    await flush();
    // All 3 gather turns are in flight BEFORE any of them settles — the whole
    // point of the parallel path (sequential asserts exactly 1 here).
    expect(turnCalls).toHaveLength(3);

    d0.release();
    d1.release();
    d2.release();
    await p;

    // 4th call is the single synthesis turn.
    expect(turnCalls).toHaveLength(4);
    expect((turnCalls[3] as { turnId: string }).turnId).toBe("run-abc:brief");
    expect(turnCalls[3].toolChoice).toEqual({ type: "none" });
  });

  it("bounds concurrency at GATHER_CONCURRENCY", async () => {
    const defs = Array.from({ length: 6 }, () => deferredDriver());
    drivers = defs.map((d) => d.driver);

    const h = makeHandlers();
    const p = runRoutine(
      Array.from({ length: 6 }, (_, i) => block(i % 2 ? "get_news" : "get_weather")),
      makeCtx({ synthesize: true, parallel: true }),
      h,
    );

    await flush();
    // Only GATHER_CONCURRENCY (4) turns start; blocks 4 and 5 wait for a slot.
    expect(turnCalls).toHaveLength(GATHER_CONCURRENCY);

    // Release one → the freed worker starts a 5th turn.
    defs[0].release();
    await flush();
    expect(turnCalls).toHaveLength(GATHER_CONCURRENCY + 1);

    // Drain the pool: release everything currently in flight, flush so freed
    // workers start the next block, repeat until all 6 gather turns + the
    // synthesis turn have run (a not-yet-started turn has a no-op release()).
    for (let i = 0; i < 10 && turnCalls.length < 7; i++) {
      for (const d of defs) d.release();
      await flush();
    }
    await p;
    // 6 gather + 1 synthesis.
    expect(turnCalls).toHaveLength(7);
  });

  it("preserves authored receipt order under out-of-order completion", async () => {
    const defs = [deferredDriver(), deferredDriver(), deferredDriver()];
    // Distinct narration per block, keyed by which tool the turn was forced to.
    const say: Record<string, string> = {
      get_weather: "Clear, 94F.",
      get_news: "Two headlines.",
      read_gmail: "Just bots.",
    };
    drivers = defs.map((d) => (opts: Record<string, unknown>) => {
      const tool = (opts.toolChoice as { name: string }).name;
      (opts.onTextDelta as (s: string) => void)(say[tool]);
      return d.driver(opts);
    });

    const h = makeHandlers();
    const p = runRoutine(
      [block("get_weather"), block("get_news"), block("read_gmail")],
      makeCtx({ synthesize: true, parallel: true }),
      h,
    );
    await flush();

    // Settle OUT of authored order: 2 (gmail), then 0 (weather), then 1 (news).
    defs[2].release();
    await flush();
    defs[0].release();
    await flush();
    defs[1].release();
    const results = await p;

    // Results keep AUTHORED block order despite out-of-order completion.
    expect(results[0].tool).toBe("get_weather");
    expect(results[1].tool).toBe("get_news");
    expect(results[2].tool).toBe("read_gmail");

    // The synthesis receipts (turnCalls[3]) list WEATHER before NEWS before GMAIL.
    const synthMsg = (turnCalls[3].messages as Array<{ content: string }>)[0].content;
    const wi = synthMsg.indexOf("WEATHER:");
    const ni = synthMsg.indexOf("NEWS:");
    const gi = synthMsg.indexOf("GMAIL:");
    expect(wi).toBeGreaterThanOrEqual(0);
    expect(wi).toBeLessThan(ni);
    expect(ni).toBeLessThan(gi);
  });

  it("emits EXACTLY ONE synthesis turn + zero per-block bus cycles (4 parallel blocks)", async () => {
    drivers = [
      (opts) => {
        (opts.onAction as (i: string, n: string, r: unknown) => void)("tu-w", "get_weather", {});
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => {
        (opts.onAction as (i: string, n: string, r: unknown) => void)("tu-n", "get_news", {});
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => {
        (opts.onAction as (i: string, n: string, r: unknown) => void)("tu-g", "read_gmail", {});
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => {
        (opts.onAction as (i: string, n: string, r: unknown) => void)("tu-wa", "read_whatsapp", {});
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => {
        (opts.onTextDelta as (s: string) => void)("Welcome home, sir.");
        (opts.onDone as (u: unknown) => void)({});
      },
    ];

    const h = makeHandlers();
    await runRoutine(
      [block("get_weather"), block("get_news"), block("read_gmail"), block("read_whatsapp")],
      makeCtx({ synthesize: true, parallel: true }),
      h,
    );

    expect(turnCalls).toHaveLength(5); // 4 gather + 1 synthesis
    expect(h.events.filter((e) => e.startsWith("opener:"))).toHaveLength(1);
    expect(h.events.filter((e) => e.startsWith("synthstart:run-abc:brief"))).toHaveLength(1);
    expect(h.events.filter((e) => e.startsWith("synthdone:run-abc:brief"))).toHaveLength(1);
    // No per-block bus narration/lifecycle.
    expect(h.events.some((e) => e.startsWith("delta:"))).toBe(false);
    expect(h.events.some((e) => e.startsWith("start:"))).toBe(false);
    expect(h.events.some((e) => e.startsWith("blockdone:"))).toBe(false);
    // Receipts still render.
    expect(h.events.filter((e) => e.startsWith("action:"))).toHaveLength(4);
  });

  it("uses an EMPTY thread per block — no cross-block assistant notes", async () => {
    drivers = [
      (opts) => {
        (opts.onTextDelta as (s: string) => void)("Found 3 unanswered emails.");
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}), // synthesis turn
    ];

    const h = makeHandlers();
    await runRoutine(
      [block("read_gmail"), block("get_weather"), block("get_news")],
      makeCtx({ synthesize: true, parallel: true }),
      h,
    );

    // Every GATHER turn (0..2) carries exactly one message: its own directive.
    for (let i = 0; i < 3; i++) {
      const msgs = turnCalls[i].messages as Array<{ role: string; content: string }>;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe("user");
      expect(JSON.stringify(msgs)).not.toContain("[Block ");
    }
  });

  it("isolates a block error in the pool without starving other workers", async () => {
    drivers = [
      (opts) => {
        (opts.onTextDelta as (s: string) => void)("Clear, 94F.");
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => (opts.onError as (m: string) => void)("gmail auth failed"),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}), // synthesis
    ];

    const h = makeHandlers();
    const results = await runRoutine(
      [block("get_weather"), block("read_gmail"), block("get_news"), block("read_whatsapp")],
      makeCtx({ synthesize: true, parallel: true }),
      h,
    );

    expect(turnCalls).toHaveLength(5); // all gather turns + synthesis ran
    expect(results[1].error).toBe("gmail auth failed");
    expect(h.done).toHaveLength(4);
    const synthMsg = (turnCalls[4].messages as Array<{ content: string }>)[0].content;
    expect(synthMsg).toContain("GMAIL: (unavailable — gmail auth failed)");
  });

  it("fires gather-progress hooks on the parallel path (3 starts + 3 dones)", async () => {
    drivers = [
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}), // synthesis
    ];
    const h = makeHandlers();
    await runRoutine(
      [block("get_weather"), block("get_news"), block("read_gmail")],
      makeCtx({ synthesize: true, parallel: true }),
      h,
    );
    expect(h.events.filter((e) => e.startsWith("gatherstart:"))).toHaveLength(3);
    expect(h.events.filter((e) => e.startsWith("gatherdone:"))).toHaveLength(3);
  });

  it("also fires gather-progress hooks on the SEQUENTIAL synthesize path", async () => {
    drivers = [
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}),
      (opts) => (opts.onDone as (u: unknown) => void)({}), // synthesis
    ];
    const h = makeHandlers();
    await runRoutine(
      [block("get_weather"), block("get_news"), block("read_gmail"), block("read_whatsapp")],
      makeCtx({ synthesize: true }), // synth, NOT parallel
      h,
    );
    expect(h.events.filter((e) => e.startsWith("gatherstart:"))).toHaveLength(4);
    expect(h.events.filter((e) => e.startsWith("gatherdone:"))).toHaveLength(4);
  });

  it("does NOT fire gather-progress hooks when synthesize is false", async () => {
    const h = makeHandlers();
    await runRoutine([block("get_weather")], makeCtx(), h);
    expect(h.events.some((e) => e.startsWith("gatherstart:"))).toBe(false);
    expect(h.events.some((e) => e.startsWith("gatherdone:"))).toBe(false);
  });

  it("ignores parallel when synthesize is false (strict-sequential contract holds)", async () => {
    const order: string[] = [];
    const d0 = deferredDriver((opts) => {
      order.push("b0-start");
      void opts;
    });
    drivers = [
      d0.driver,
      (opts) => {
        order.push("b1-start");
        (opts.onTextDelta as (s: string) => void)("Sunny.");
        (opts.onDone as (u: unknown) => void)({});
      },
    ];

    const h = makeHandlers();
    const p = runRoutine(
      [block("get_weather"), block("read_gmail")],
      makeCtx({ parallel: true }), // parallel WITHOUT synthesize → ignored
      h,
    );

    await flush();
    // Block 1 has NOT started — sequential, no synthesis, per-block narration.
    expect(order).toEqual(["b0-start"]);
    expect(turnCalls).toHaveLength(1);

    d0.release();
    await p;
    expect(order).toEqual(["b0-start", "b1-start"]);
    expect(turnCalls).toHaveLength(2); // no synthesis turn
    expect(h.events).toContain("delta:run-abc:b1:Sunny.");
    expect(h.events.some((e) => e.startsWith("synthstart:"))).toBe(false);
  });

  it("handles an unknown tool in parallel mode (skipped, marked unavailable, pool completes)", async () => {
    drivers = [
      (opts) => {
        (opts.onTextDelta as (s: string) => void)("Clear, 94F.");
        (opts.onDone as (u: unknown) => void)({});
      },
      (opts) => (opts.onDone as (u: unknown) => void)({}), // synthesis
    ];
    const h = makeHandlers();
    const results = await runRoutine(
      [block("not_a_tool"), block("get_weather")],
      makeCtx({ synthesize: true, parallel: true }),
      h,
    );

    // Bogus block never reached run-turn; only the valid block + synthesis did.
    expect(turnCalls).toHaveLength(2);
    expect(results[0].error).toContain("unknown tool: not_a_tool");
    expect(results[1].tool).toBe("get_weather");
    const synthMsg = (turnCalls[1].messages as Array<{ content: string }>)[0].content;
    expect(synthMsg).toContain("(unavailable —");
    // The skipped block still fired a gather done (progress UI needs it).
    expect(h.events.filter((e) => e.startsWith("gatherdone:"))).toHaveLength(2);
  });
});
