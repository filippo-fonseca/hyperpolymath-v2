/**
 * Issue #283 — deterministic web scrollback ordering.
 *
 * Proves compareTurns / sortTurns never invert a user↔assistant pair, even when
 * the two turns share the same millisecond timestamp (the reported defect: the
 * old createdAt-only sort in JarvisConsole.mergeById flipped tied pairs so the
 * reply rendered above the question) and even when turns interleave/overlap.
 *
 * The comparator is the exact logic JarvisConsole.mergeById now delegates to,
 * so testing it here directly covers both the live realtime-merge path and the
 * renderer's defensive sort.
 */

import { describe, expect, it } from "vitest";
import {
  compareTurns,
  nextTurnSeq,
  sortTurns,
} from "@/components/jarvis/transcript-order";
import type { ScrollbackTurn } from "@/components/jarvis/jarvis-types";

// --- builders ---------------------------------------------------------------

function user(text: string, atMs: number, seq?: number): ScrollbackTurn {
  return { kind: "user", id: `u-${text}-${atMs}-${seq ?? "x"}`, text, createdAt: new Date(atMs), seq };
}

function assistant(text: string, atMs: number, seq?: number): ScrollbackTurn {
  return {
    kind: "assistant",
    id: `a-${text}-${atMs}-${seq ?? "x"}`,
    textDelta: text,
    actions: [],
    status: "done",
    createdAt: new Date(atMs),
    seq,
  };
}

/** Compact "role:text" render of the sorted order, mirroring the desktop test. */
function render(turns: ScrollbackTurn[]): string[] {
  return turns.map((t) => (t.kind === "user" ? `user:${t.text}` : `jarvis:${t.textDelta}`));
}

// --- the reported defect ----------------------------------------------------

describe("transcript-order — a same-millisecond pair never inverts", () => {
  it("user before assistant when timestamps tie (input already ordered)", () => {
    const t = 1_700_000_000_000;
    const sorted = sortTurns([user("hello", t, 1), assistant("hi there", t, 2)]);
    expect(render(sorted)).toEqual(["user:hello", "jarvis:hi there"]);
  });

  it("user before assistant when timestamps tie AND input is inverted", () => {
    // This is the exact shape mergeById produced: a realtime refresh handed the
    // assistant row first, then the user row, both at the same ms.
    const t = 1_700_000_000_000;
    const sorted = sortTurns([assistant("hi there", t, 2), user("hello", t, 1)]);
    expect(render(sorted)).toEqual(["user:hello", "jarvis:hi there"]);
  });

  it("compareTurns puts user first on a raw ms tie regardless of seq direction", () => {
    const t = 1_700_000_000_000;
    // Even if the assistant's seq is LOWER (e.g. a stale/absent stamp), the
    // kind tiebreak wins so the pair stays logical.
    expect(compareTurns(user("q", t, 5), assistant("a", t, 1))).toBeLessThan(0);
    expect(compareTurns(assistant("a", t, 1), user("q", t, 5))).toBeGreaterThan(0);
  });
});

describe("transcript-order — sequential and overlapping turns", () => {
  it("two sequential pairs stay in order", () => {
    const sorted = sortTurns([
      user("q1", 1000, 1),
      assistant("a1", 1000, 2),
      user("q2", 2000, 3),
      assistant("a2", 2000, 4),
    ]);
    expect(render(sorted)).toEqual(["user:q1", "jarvis:a1", "user:q2", "jarvis:a2"]);
  });

  it("interleaved arrival order is corrected by timestamp", () => {
    // Rows arrive scrambled (as a merge of local + refreshed DB rows might),
    // but distinct timestamps + the pair tiebreak reconstruct the transcript.
    const sorted = sortTurns([
      assistant("a2", 2000, 4),
      user("q1", 1000, 1),
      assistant("a1", 1000, 2),
      user("q2", 2000, 3),
    ]);
    expect(render(sorted)).toEqual(["user:q1", "jarvis:a1", "user:q2", "jarvis:a2"]);
  });

  it("a pair whose assistant ms trails its user by 1ms stays ordered", () => {
    const sorted = sortTurns([assistant("a1", 1001, 2), user("q1", 1000, 1)]);
    expect(render(sorted)).toEqual(["user:q1", "jarvis:a1"]);
  });
});

describe("transcript-order — same-kind millisecond tie falls back to seq", () => {
  it("two user turns in the same ms keep true creation order via seq", () => {
    const t = 1_700_000_000_000;
    const sorted = sortTurns([user("second", t, 2), user("first", t, 1)]);
    expect(render(sorted)).toEqual(["user:first", "user:second"]);
  });

  it("a missing seq sorts deterministically before a stamped same-kind turn", () => {
    const t = 1_700_000_000_000;
    const sorted = sortTurns([user("stamped", t, 3), user("legacy", t, undefined)]);
    expect(render(sorted)).toEqual(["user:legacy", "user:stamped"]);
  });
});

describe("transcript-order — nextTurnSeq is monotonic", () => {
  it("hands out strictly increasing values", () => {
    const a = nextTurnSeq();
    const b = nextTurnSeq();
    const c = nextTurnSeq();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe("transcript-order — sortTurns is pure", () => {
  it("does not mutate the input array", () => {
    const input = [assistant("a1", 1000, 2), user("q1", 1000, 1)];
    const before = input.slice();
    sortTurns(input);
    expect(input).toEqual(before);
  });
});
