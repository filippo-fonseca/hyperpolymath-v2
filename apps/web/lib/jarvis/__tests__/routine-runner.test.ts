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
  };
  return h;
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
    let releaseBlock0: (() => void) | null = null;
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

    releaseBlock0?.();
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
