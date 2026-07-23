/**
 * turn-abort-registry — real server-side abort for the persistent-SSE voice
 * path. Verifies register/abort/unregister and the cross-instance bus listener
 * (a `jarvis-cancel` bus event aborts the matching / all controllers).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { physicalBus } from "@/lib/voice/physical-extension/bus";
import {
  registerTurnAbort,
  unregisterTurnAbort,
  abortTurn,
  abortAllTurns,
} from "@/lib/jarvis/turn-abort-registry";

describe("turn-abort-registry", () => {
  beforeEach(() => {
    abortAllTurns(); // clean slate between tests
  });

  it("registers a controller whose signal is initially not aborted", () => {
    const c = registerTurnAbort("t1");
    expect(c.signal.aborted).toBe(false);
    unregisterTurnAbort("t1");
  });

  it("abortTurn aborts the matching controller and returns true, false when absent", () => {
    const c = registerTurnAbort("t2");
    expect(abortTurn("t2")).toBe(true);
    expect(c.signal.aborted).toBe(true);
    // Already retired → second abort is a no-op miss.
    expect(abortTurn("t2")).toBe(false);
    expect(abortTurn("never-registered")).toBe(false);
  });

  it("abortAllTurns aborts every registered controller", () => {
    const a = registerTurnAbort("a");
    const b = registerTurnAbort("b");
    const n = abortAllTurns();
    expect(n).toBe(2);
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
  });

  it("aborts via a jarvis-cancel bus event targeting a turnId", () => {
    const c = registerTurnAbort("bus-turn");
    physicalBus.emit("jarvis-cancel", { turnId: "bus-turn", at: 1 });
    expect(c.signal.aborted).toBe(true);
  });

  it("aborts all via a jarvis-cancel bus event with all=true", () => {
    const a = registerTurnAbort("x");
    const b = registerTurnAbort("y");
    physicalBus.emit("jarvis-cancel", { all: true, at: 1 });
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
  });

  it("registerTurnAbort returns the same controller for a repeat turnId", () => {
    const first = registerTurnAbort("dup");
    const second = registerTurnAbort("dup");
    expect(second).toBe(first);
    unregisterTurnAbort("dup");
  });
});
