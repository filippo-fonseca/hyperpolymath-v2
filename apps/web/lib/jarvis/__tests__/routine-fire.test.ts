/**
 * routine-fire — jarvis-routine-progress emission ordering (progress-bus unit).
 *
 * `fireRoutineOverBus` fires a routine's blocks over the physical SSE bus. In
 * SYNTHESIZE mode it must ALSO emit the real-time `jarvis-routine-progress`
 * lifecycle the desktop HUD loader renders:
 *   start → N×gather-start (index order) → N×gather-done (completion order)
 *   → synthesizing → done.
 * A NON-synthesize routine must emit ZERO progress events.
 *
 * We mock `@/lib/jarvis/run-turn` at the module boundary (per CLAUDE.md — never
 * the raw SDK), driving its callbacks so no Anthropic/DB is touched, and mock
 * the bus to capture every emit. `@/lib/db` + schema are mocked inert because
 * routine-fire imports them at module top for its OTHER exports.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RoutineBlock } from "@hyperpolymath/jarvis-core/routines";
import type { PhysicalJarvisRoutineProgress } from "@/lib/voice/physical-extension/types";

// ---- run-turn mock (driver queue, mirrors routine-runner.test.ts) ----------
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

// ---- bus mock: capture progress events + a global emit-order counter -------
let emitSeq = 0;
const progressEvents: Array<PhysicalJarvisRoutineProgress & { _seq: number }> = [];
let responseStartSeq: number[] = [];
let responseEndSeq: number[] = [];

vi.mock("@/lib/voice/physical-extension/bus", () => ({
  emitJarvisResponseStart: vi.fn(() => {
    responseStartSeq.push(emitSeq++);
  }),
  emitJarvisResponseChunk: vi.fn(() => {
    emitSeq++;
  }),
  emitJarvisResponseEnd: vi.fn(() => {
    responseEndSeq.push(emitSeq++);
  }),
  emitJarvisToolCall: vi.fn(() => {
    emitSeq++;
  }),
  emitJarvisRoutineProgress: vi.fn((p: PhysicalJarvisRoutineProgress) => {
    progressEvents.push({ ...p, _seq: emitSeq++ });
  }),
}));

// routine-fire imports @/lib/db + schema at module top (for getEnabledRoutines
// etc.); keep the import graph inert under vitest.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({ routines: {} }));

import { fireRoutineOverBus, type FireRoutineOpts } from "@/lib/jarvis/routine-fire";

function block(tool: string, id = ""): RoutineBlock {
  return { id, tool: tool as RoutineBlock["tool"], params: {} };
}

function makeOpts(over: Partial<FireRoutineOpts> = {}): FireRoutineOpts {
  return {
    userId: "user-1",
    apiKey: "sk-test",
    isVoice: true,
    routineName: "Morning Brief",
    runId: "run-abc",
    synthesize: true,
    parallel: true,
    ...over,
  };
}

const phases = (): string[] => progressEvents.map((p) => p.phase);

/** A driver held in-flight until release() settles onDone. */
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

beforeEach(() => {
  turnCalls.length = 0;
  drivers = [];
  defaultDriver = (opts) => (opts.onDone as (u: unknown) => void)({});
  runJarvisTurnStreamMock.mockClear();
  progressEvents.length = 0;
  responseStartSeq = [];
  responseEndSeq = [];
  emitSeq = 0;
});

describe("fireRoutineOverBus — routine-progress (synthesize)", () => {
  it("emits the full ordered lifecycle for a parallel 3-block synthesize routine", async () => {
    const blocks = [block("get_weather"), block("read_gmail"), block("get_news")];

    // 3 deferred gather drivers + 1 immediate synthesis driver.
    const g0 = deferredDriver();
    const g1 = deferredDriver();
    const g2 = deferredDriver();
    drivers = [g0.driver, g1.driver, g2.driver /* synth uses defaultDriver */];

    const runId = fireRoutineOverBus(blocks, makeOpts());

    expect(runId).toBe("run-abc");
    // start is the FIRST progress event of the run (emitted synchronously,
    // before the opener and every gather event — lowest emit seq).
    const start = progressEvents[0];
    expect(start.phase).toBe("start");
    expect(start._seq).toBe(Math.min(...progressEvents.map((p) => p._seq)));
    expect(start.total).toBe(3);
    expect(start.routineName).toBe("Morning Brief");
    expect(start.sources).toEqual([
      { blockId: "run-abc:b0", index: 0, tool: "get_weather", label: "Weather" },
      { blockId: "run-abc:b1", index: 1, tool: "read_gmail", label: "Email" },
      { blockId: "run-abc:b2", index: 2, tool: "get_news", label: "News" },
    ]);

    // Let all three gather turns begin (pool grabs indices in order).
    await vi.waitFor(() =>
      expect(phases().filter((p) => p === "gather-start")).toHaveLength(3),
    );
    const gatherStarts = progressEvents.filter((p) => p.phase === "gather-start");
    expect(gatherStarts.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(gatherStarts.map((p) => p.label)).toEqual(["Weather", "Email", "News"]);

    // Release out of order: 2, 0, 1 → gather-done arrives in completion order.
    g2.release();
    await vi.waitFor(() =>
      expect(phases().filter((p) => p === "gather-done")).toHaveLength(1),
    );
    g0.release();
    g1.release();

    await vi.waitFor(() => expect(phases()).toContain("done"));

    const gatherDones = progressEvents.filter((p) => p.phase === "gather-done");
    expect(gatherDones.map((p) => p.index)).toEqual([2, 0, 1]);
    for (const d of gatherDones) {
      expect(d.ok).toBe(true);
      expect(d.error).toBeUndefined();
      expect(d.blockId).toBe(`run-abc:b${d.index}`);
    }

    // Exactly one synthesizing then one done, total 1+3+3+1+1 = 9.
    expect(phases().filter((p) => p === "synthesizing")).toHaveLength(1);
    expect(phases().filter((p) => p === "done")).toHaveLength(1);
    expect(progressEvents).toHaveLength(9);

    // All share runId + routineName.
    for (const p of progressEvents) {
      expect(p.runId).toBe("run-abc");
      expect(p.routineName).toBe("Morning Brief");
      expect(p.total).toBe(3);
    }

    // synthesizing before the brief's response-start; done after response-end.
    const synthesizing = progressEvents.find((p) => p.phase === "synthesizing")!;
    const done = progressEvents.find((p) => p.phase === "done")!;
    expect(synthesizing._seq).toBeLessThan(Math.max(...responseStartSeq));
    expect(done._seq).toBeGreaterThan(Math.max(...responseEndSeq));
  });

  it("skeleton blockIds match the gather event blockIds (empty authored ids)", async () => {
    const blocks = [block("get_weather", ""), block("read_gmail", "")];
    fireRoutineOverBus(blocks, makeOpts({ parallel: false }));
    await vi.waitFor(() => expect(phases()).toContain("done"));

    const start = progressEvents[0];
    const skeletonIds = start.sources!.map((s) => s.blockId);
    const gatherIds = progressEvents
      .filter((p) => p.phase === "gather-start")
      .map((p) => p.blockId);
    expect(skeletonIds).toEqual(["run-abc:b0", "run-abc:b1"]);
    expect(gatherIds).toEqual(skeletonIds);
  });

  it("marks an errored gather ok:false with the error, still reaching done", async () => {
    const blocks = [block("get_weather"), block("read_gmail")];
    drivers = [
      (opts) => {
        (opts.onError as (m: string) => void)("boom");
      },
      // second gather + synthesis use defaultDriver (onDone)
    ];
    fireRoutineOverBus(blocks, makeOpts({ parallel: false }));
    await vi.waitFor(() => expect(phases()).toContain("done"));

    const errored = progressEvents.find(
      (p) => p.phase === "gather-done" && p.index === 0,
    )!;
    expect(errored.ok).toBe(false);
    expect(errored.error).toBe("boom");
    expect(phases()).toContain("synthesizing");
    expect(phases()).toContain("done");
  });

  it("sequential synthesize still emits start → alternating pairs → synthesizing → done", async () => {
    const blocks = [block("get_weather"), block("read_gmail")];
    fireRoutineOverBus(blocks, makeOpts({ parallel: false }));
    await vi.waitFor(() => expect(phases()).toContain("done"));

    expect(phases()).toEqual([
      "start",
      "gather-start",
      "gather-done",
      "gather-start",
      "gather-done",
      "synthesizing",
      "done",
    ]);
  });
});

describe("fireRoutineOverBus — non-synthesize emits nothing", () => {
  it("emits zero progress events when synthesize is undefined", async () => {
    const blocks = [block("get_weather"), block("read_gmail"), block("get_news")];
    fireRoutineOverBus(blocks, makeOpts({ synthesize: undefined, parallel: undefined }));
    // Non-synthesize: each block emits its own response cycle; wait for the last
    // run-turn call to complete, then assert no progress.
    await vi.waitFor(() => expect(turnCalls.length).toBe(3));
    await Promise.resolve();
    expect(progressEvents).toHaveLength(0);
  });

  it("emits zero progress events when synthesize is false", async () => {
    const blocks = [block("get_weather"), block("read_gmail")];
    fireRoutineOverBus(blocks, makeOpts({ synthesize: false, parallel: false }));
    await vi.waitFor(() => expect(turnCalls.length).toBe(2));
    await Promise.resolve();
    expect(progressEvents).toHaveLength(0);
  });
});
