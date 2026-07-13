import { describe, expect, it } from "vitest";

import {
  createTranscriptState,
  reduceClear,
  reduceReplyDelta,
  reduceReplyStart,
  reduceUserEcho,
  type RenderOp,
  type TranscriptState,
} from "./transcript-order";

// A tiny driver that mirrors how main.ts funnels events through the reducer:
// it threads ONE state across a sequence of events and collects the ops. It
// also builds a DOM-free "render model" so tests can assert the resulting
// on-screen order without a real DOM — exactly the invariant that matters.
type Event =
  | { kind: "user"; text: string; turnId?: string }
  | { kind: "start"; turnId: string }
  | { kind: "delta"; turnId: string; delta: string }
  | { kind: "clear" };

interface Bubble {
  id: string;
  role: "user" | "jarvis";
  text: string;
}

/** Replay ops against an ordered bubble list exactly as main.ts's DOM executor
 *  does: create-* inserts a bubble before `beforeId` (null = append), and
 *  append-delta writes to the bubble addressed by its stable id — never a
 *  "current" pointer — so overlapping turns can't cross-write. */
function applyOps(bubbles: Bubble[], ops: RenderOp[]): void {
  for (const op of ops) {
    if (op.op === "append-delta") {
      const b = bubbles.find((x) => x.id === op.id);
      if (!b) throw new Error(`delta for missing bubble ${op.id}`);
      b.text += op.delta;
      continue;
    }
    const bubble: Bubble = {
      id: op.id,
      role: op.op === "create-user" ? "user" : "jarvis",
      text: op.op === "create-user" ? op.text : "",
    };
    if (op.beforeId === null) {
      bubbles.push(bubble);
    } else {
      const idx = bubbles.findIndex((x) => x.id === op.beforeId);
      if (idx === -1) bubbles.push(bubble);
      else bubbles.splice(idx, 0, bubble);
    }
  }
}

function drive(events: Event[]): { state: TranscriptState; bubbles: Bubble[] } {
  let state = createTranscriptState();
  const bubbles: Bubble[] = [];
  for (const e of events) {
    let res;
    if (e.kind === "user") res = reduceUserEcho(state, e.text, e.turnId);
    else if (e.kind === "start") res = reduceReplyStart(state, e.turnId);
    else if (e.kind === "delta") res = reduceReplyDelta(state, e.turnId, e.delta);
    else res = reduceClear(state);
    state = res.state;
    if (e.kind === "clear") bubbles.length = 0;
    else applyOps(bubbles, res.ops);
  }
  return { state, bubbles };
}

/** Compact "role:text" render for order assertions. */
function render(bubbles: Bubble[]): string[] {
  return bubbles.map((b) => `${b.role}:${b.text}`);
}

describe("transcript-order — simple ordered turn", () => {
  it("user then reply renders user above reply", () => {
    const { bubbles } = drive([
      { kind: "user", text: "hello" },
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "hi there" },
    ]);
    expect(render(bubbles)).toEqual(["user:hello", "jarvis:hi there"]);
  });

  it("two sequential turns stay in order", () => {
    const { bubbles } = drive([
      { kind: "user", text: "q1" },
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "a1" },
      { kind: "user", text: "q2" },
      { kind: "start", turnId: "B" },
      { kind: "delta", turnId: "B", delta: "a2" },
    ]);
    expect(render(bubbles)).toEqual(["user:q1", "jarvis:a1", "user:q2", "jarvis:a2"]);
  });
});

describe("transcript-order — reply before its user echo (SSE beats STT)", () => {
  it("reply-first turn slots the user bubble in above the reply", () => {
    const { bubbles } = drive([
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "hi" },
      { kind: "user", text: "hello" },
    ]);
    expect(render(bubbles)).toEqual(["user:hello", "jarvis:hi"]);
  });

  it("reply-first then a normal second turn still orders correctly", () => {
    const { bubbles } = drive([
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "a1" },
      { kind: "user", text: "q1" },
      { kind: "user", text: "q2" },
      { kind: "start", turnId: "B" },
      { kind: "delta", turnId: "B", delta: "a2" },
    ]);
    expect(render(bubbles)).toEqual(["user:q1", "jarvis:a1", "user:q2", "jarvis:a2"]);
  });
});

describe("transcript-order — the reported defect: interleaved overlapping turns", () => {
  // The live repro that motivated this module: the user asked a partial
  // ("who plays in the"), then the full question ("…world cup final"). Turn A's
  // clarification reply rendered AFTER turn B's reply because a single-pair
  // machine couldn't hold two open pairs. Server ordering is per-turn
  // sequential — transcript_A → start_A → transcript_B → start_B — so FIFO
  // pairing binds each reply to its own user turn. The bug was purely in the
  // single-slot representation; with a per-turn model the pairs stay ordered.
  it("A's reply renders under A even though B's turn opened in between", () => {
    const { bubbles } = drive([
      { kind: "user", text: "who plays in the" },
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "which sport?" },
      { kind: "user", text: "who plays in the world cup final" },
      { kind: "start", turnId: "B" },
      { kind: "delta", turnId: "B", delta: "let me check" },
    ]);
    expect(render(bubbles)).toEqual([
      "user:who plays in the",
      "jarvis:which sport?",
      "user:who plays in the world cup final",
      "jarvis:let me check",
    ]);
  });

  // TURNLESS legacy path (POST fallback echoes carry no turnId). With no
  // identity to pair on, FIFO keeps each reply under the oldest waiting user
  // bubble: the two echoes arrived in order, so reply-starts fill them
  // oldest-first regardless of which turnId's start landed first. NOTE this is a
  // best-effort ordering — it is CORRECT only because the server truly emitted
  // A's reply before B's; the turnId'd test below proves true identity even when
  // the server inverts that order.
  it("turnless reply-starts arriving out of order pair oldest-user-first (FIFO)", () => {
    const { bubbles } = drive([
      { kind: "user", text: "qA" },
      { kind: "user", text: "qB" },
      // The second reply-start (turnId B) lands at the client before A's.
      { kind: "start", turnId: "B" },
      { kind: "delta", turnId: "B", delta: "answerToA" },
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "answerToB" },
    ]);
    // FIFO: first reply-start pairs with the oldest waiting user turn (qA).
    expect(render(bubbles)).toEqual([
      "user:qA",
      "jarvis:answerToA",
      "user:qB",
      "jarvis:answerToB",
    ]);
  });

  // IDENTITY path (the real fix): when the user echoes carry their reply's
  // turnId (server mints it before the echo — routine-interception threads it as
  // echoTurnId), reply-starts pair by identity even when the SERVER inverts
  // relative order. The exact [echo_A, echo_B, start_B, start_A] interleaving
  // the review flagged: start_B must attach to B's user (qB), start_A to A's
  // (qA) — the OPPOSITE of what FIFO would give here, proving true turn identity.
  it("turnId'd echoes pair each reply to its OWN user even when starts invert", () => {
    const { bubbles } = drive([
      { kind: "user", text: "qA", turnId: "A" },
      { kind: "user", text: "qB", turnId: "B" },
      // Server inverts: B's reply-start lands before A's at the client.
      { kind: "start", turnId: "B" },
      { kind: "delta", turnId: "B", delta: "answerToB" },
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "answerToA" },
    ]);
    // Identity, not arrival order: qA↔answerToA, qB↔answerToB.
    expect(render(bubbles)).toEqual([
      "user:qA",
      "jarvis:answerToA",
      "user:qB",
      "jarvis:answerToB",
    ]);
  });

  // Reply-first ordering with identity: the reply arrives before its echo (SSE
  // beats the echo) and the echo, when it lands, carries the SAME turnId — it
  // must slot above ITS reply, not an unrelated earlier reply-first turn.
  it("identity pairs a reply-first turn to its own late echo", () => {
    const { bubbles } = drive([
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "answerToA" },
      { kind: "start", turnId: "B" },
      { kind: "delta", turnId: "B", delta: "answerToB" },
      // Echoes land after both replies, in REVERSE, each carrying its turnId.
      { kind: "user", text: "qB", turnId: "B" },
      { kind: "user", text: "qA", turnId: "A" },
    ]);
    expect(render(bubbles)).toEqual([
      "user:qA",
      "jarvis:answerToA",
      "user:qB",
      "jarvis:answerToB",
    ]);
  });

  // MIXED stream (backward compatibility): one turn is turnId'd, one is turnless.
  // An identified reply must take its OWN partner and must NOT steal the turnless
  // echo that FIFO owes to the turnless reply. Order: turnless echo qX arrives
  // first, then identified echo qA(turnId A); reply-start A must pair with qA (by
  // identity), and the turnless reply-start must pair with qX (FIFO) — never the
  // reverse, which would strand qA.
  it("identity never steals a turnless FIFO slot in a mixed stream", () => {
    const { bubbles } = drive([
      { kind: "user", text: "qX" }, // turnless (POST-fallback style)
      { kind: "user", text: "qA", turnId: "A" }, // identified
      // A's reply-start lands FIRST even though qA is the newer user turn.
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "answerToA" },
      // The turnless turn's reply lands second.
      { kind: "start", turnId: "X" },
      { kind: "delta", turnId: "X", delta: "answerToX" },
    ]);
    // A binds to qA by identity (not the older qX); X takes qX by FIFO.
    expect(render(bubbles)).toEqual([
      "user:qX",
      "jarvis:answerToX",
      "user:qA",
      "jarvis:answerToA",
    ]);
  });

  it("fully interleaved: user_A, reply_A_start, user_B, reply_B_start, deltas both", () => {
    const { bubbles } = drive([
      { kind: "user", text: "qA" },
      { kind: "start", turnId: "A" },
      { kind: "user", text: "qB" },
      { kind: "start", turnId: "B" },
      // deltas arrive interleaved — each must hit its own bubble.
      { kind: "delta", turnId: "B", delta: "B1" },
      { kind: "delta", turnId: "A", delta: "A1" },
      { kind: "delta", turnId: "B", delta: "B2" },
      { kind: "delta", turnId: "A", delta: "A2" },
    ]);
    expect(render(bubbles)).toEqual(["user:qA", "jarvis:A1A2", "user:qB", "jarvis:B1B2"]);
  });
});

describe("transcript-order — delta routing never crosses turns", () => {
  it("two open replies keep their own text (no global current)", () => {
    const { state, bubbles } = drive([
      { kind: "user", text: "qA" },
      { kind: "start", turnId: "A" },
      { kind: "user", text: "qB" },
      { kind: "start", turnId: "B" },
      { kind: "delta", turnId: "A", delta: "alpha" },
      { kind: "delta", turnId: "B", delta: "beta" },
    ]);
    const a = bubbles.find((b) => b.role === "jarvis" && b.text === "alpha");
    const b = bubbles.find((b) => b.role === "jarvis" && b.text === "beta");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.id).not.toBe(b!.id);
    expect(state.turns).toHaveLength(2);
  });

  it("a chunk racing ahead of its start still lands in the right bubble", () => {
    const { bubbles } = drive([
      { kind: "user", text: "q" },
      // delta with no prior start — reducer synthesizes the reply bubble.
      { kind: "delta", turnId: "A", delta: "answer" },
    ]);
    expect(render(bubbles)).toEqual(["user:q", "jarvis:answer"]);
  });
});

describe("transcript-order — turns with no reply", () => {
  it("a user turn that never gets a reply just stands alone", () => {
    const { bubbles, state } = drive([
      { kind: "user", text: "q1" },
      { kind: "user", text: "q2" },
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "a1" },
    ]);
    // q1 got the reply (earliest waiting user turn); q2 stands alone.
    expect(render(bubbles)).toEqual(["user:q1", "jarvis:a1", "user:q2"]);
    expect(state.turns).toHaveLength(2);
  });
});

describe("transcript-order — idempotence & clear", () => {
  it("a duplicate response-start for a bound turnId is a no-op", () => {
    const { bubbles, state } = drive([
      { kind: "user", text: "q" },
      { kind: "start", turnId: "A" },
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "a" },
    ]);
    expect(render(bubbles)).toEqual(["user:q", "jarvis:a"]);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]?.hasReply).toBe(true);
  });

  it("clear resets ordering so the next turn starts fresh", () => {
    const { bubbles, state } = drive([
      { kind: "start", turnId: "A" },
      { kind: "delta", turnId: "A", delta: "stale" },
      { kind: "clear" },
      { kind: "user", text: "fresh q" },
      { kind: "start", turnId: "B" },
      { kind: "delta", turnId: "B", delta: "fresh a" },
    ]);
    expect(render(bubbles)).toEqual(["user:fresh q", "jarvis:fresh a"]);
    expect(state.turns).toHaveLength(1);
    expect(state.seq).toBe(1);
  });
});
