// apps/desktop/src/conversation/transcript-order.ts
// Pure, DOM-free turn-pairing for the Studio HUD conversation transcript.
//
// THE DEFECT this replaces: the old single-pair state machine in main.ts
// (turnPairState + one `jarvisTurnAwaitingUser` slot + one global
// `currentReplyBody`) could only represent ONE open user↔reply pair at a time.
// When two turns overlap — a partial-utterance turn and the full-question turn,
// each with its own server turnId — the events interleave:
//
//   user_A → reply_A_start → user_B → reply_B_start → …deltas for A and B…
//
// With one parking slot and one "current" reply body, bubbles inserted in the
// wrong DOM order and streamed deltas from two live turns wrote into whichever
// bubble happened to be "current". The transcript read out of order.
//
// THE MODEL here: an ordered list of TURNS. Each turn is one user bubble plus
// its reply bubble, and a reply ALWAYS renders under ITS user turn even if a
// later turn's reply streams first. Reducer facts:
//
//   • Reply events (start/chunk) carry a stable server `turnId`. Deltas route to
//     the bubble keyed by THAT turnId — never a global "current" pointer.
//   • User echoes (the SSE `transcript` event and the POST fallback) do NOT
//     carry a turnId. They are paired to a turn by ARRIVAL ORDER: an echo fills
//     the earliest turn that is still missing its user text. If a reply opened
//     first (SSE beat the local echo), its turn is already parked awaiting a
//     user echo, so the echo slots into it and the pair renders user-above-reply.
//   • A reply with no matching parked user turn opens a NEW turn (reply-first).
//   • A user echo with no reply-first turn to fill opens a NEW turn (user-first);
//     the next reply-start with a fresh turnId attaches to it.
//
// The reducer is a PURE function (state in, {state, ops} out): it emits an
// ordered list of RenderOps that main.ts replays against the DOM. main.ts holds
// no ordering logic of its own — it only maps a turnKey to a pair of elements
// and executes each op. That keeps every interleaving unit-testable with zero
// DOM, and preserves the invariant "exactly one writer per bubble body" (deltas
// are addressed by turnKey, so two live turns never share a writer).

/** A monotonic, reducer-assigned key identifying a turn's DOM bubbles. Distinct
 *  from the server turnId (which only replies carry) so user-first turns — which
 *  have no server turnId until their reply lands — are still addressable. */
export type TurnKey = string;

/** One turn in the transcript: a user bubble and (optionally) its reply. */
export interface Turn {
  /** Reducer-assigned stable key for this turn's bubbles. */
  key: TurnKey;
  /** Server turnId once a reply has attached; null for a user-first turn whose
   *  reply hasn't started yet. */
  turnId: string | null;
  /** Whether the user bubble has been created. */
  hasUser: boolean;
  /** Whether the reply bubble has been created. */
  hasReply: boolean;
}

export interface TranscriptState {
  /** Turns in render order (index 0 = topmost). */
  turns: Turn[];
  /** Monotonic counter backing TurnKey assignment. */
  seq: number;
}

/** DOM operations the reducer asks main.ts to perform, in order. `beforeKey` is
 *  the key of the turn the new bubble must render ABOVE (null = append at end),
 *  so a reply-first turn's user echo lands above the already-rendered reply. */
export type RenderOp =
  | { op: "create-user"; key: TurnKey; text: string; beforeKey: TurnKey | null }
  | { op: "create-reply"; key: TurnKey; beforeKey: TurnKey | null }
  | { op: "append-delta"; key: TurnKey; delta: string };

export interface ReduceResult {
  state: TranscriptState;
  ops: RenderOp[];
}

/** Fresh, empty transcript-ordering state. */
export function createTranscriptState(): TranscriptState {
  return { turns: [], seq: 0 };
}

function nextKey(state: TranscriptState): { key: TurnKey; seq: number } {
  const seq = state.seq + 1;
  return { key: `t${seq}`, seq };
}

/** Key of the turn AFTER `index` (the render anchor a new bubble goes before),
 *  or null when `index` is the last turn (append at end). */
function beforeKeyAt(turns: Turn[], index: number): TurnKey | null {
  const next = turns[index + 1];
  return next ? next.key : null;
}

/**
 * A user echo arrived (already deduped upstream by decidePaintEcho). Fill the
 * earliest reply-first turn still awaiting its user bubble; if none, open a new
 * user-first turn at the end.
 */
export function reduceUserEcho(state: TranscriptState, text: string): ReduceResult {
  // Find the earliest turn that has a reply but no user bubble yet (reply-first,
  // parked awaiting its echo). The user bubble slots ABOVE that reply.
  const parkedIndex = state.turns.findIndex((t) => t.hasReply && !t.hasUser);
  if (parkedIndex !== -1) {
    const turns = state.turns.slice();
    const turn = { ...turns[parkedIndex], hasUser: true };
    turns[parkedIndex] = turn;
    // The user bubble renders directly above its own reply bubble. Both live in
    // the SAME turn container downstream, so beforeKey targets the NEXT turn.
    const beforeKey = beforeKeyAt(turns, parkedIndex);
    return {
      state: { ...state, turns },
      ops: [{ op: "create-user", key: turn.key, text, beforeKey }],
    };
  }
  // No parked reply — this is a new user-first turn appended at the end.
  const { key, seq } = nextKey(state);
  const turn: Turn = { key, turnId: null, hasUser: true, hasReply: false };
  const turns = [...state.turns, turn];
  return {
    state: { turns, seq },
    ops: [{ op: "create-user", key, text, beforeKey: null }],
  };
}

/**
 * A reply started for `turnId`. Attach to the earliest user-first turn still
 * awaiting a reply; if none, open a new reply-first turn at the end. Idempotent:
 * a duplicate response-start for a turnId already bound returns no ops.
 */
export function reduceReplyStart(state: TranscriptState, turnId: string): ReduceResult {
  // Already bound to this turnId (duplicate response-start) — no-op.
  const boundIndex = state.turns.findIndex((t) => t.turnId === turnId && t.hasReply);
  if (boundIndex !== -1) {
    return { state, ops: [] };
  }
  // Earliest user-first turn awaiting a reply (has user, no reply, not yet bound
  // to any turnId). The reply renders directly under it.
  const waitingIndex = state.turns.findIndex(
    (t) => t.hasUser && !t.hasReply && t.turnId === null,
  );
  if (waitingIndex !== -1) {
    const turns = state.turns.slice();
    const turn = { ...turns[waitingIndex], turnId, hasReply: true };
    turns[waitingIndex] = turn;
    const beforeKey = beforeKeyAt(turns, waitingIndex);
    return {
      state: { ...state, turns },
      ops: [{ op: "create-reply", key: turn.key, beforeKey }],
    };
  }
  // No waiting user turn — reply-first. Open a new turn at the end; its user
  // echo (if any) will slot in above via reduceUserEcho's parked path.
  const { key, seq } = nextKey(state);
  const turn: Turn = { key, turnId, hasUser: false, hasReply: true };
  const turns = [...state.turns, turn];
  return {
    state: { turns, seq },
    ops: [{ op: "create-reply", key, beforeKey: null }],
  };
}

/**
 * A streamed delta for `turnId`. Routes to the bubble keyed by that turnId —
 * never a global "current". If no reply bubble exists yet for the turnId (a
 * chunk raced ahead of its start), synthesize the start first so the delta has
 * a home; the emitted ops carry the implicit create.
 */
export function reduceReplyDelta(
  state: TranscriptState,
  turnId: string,
  delta: string,
): ReduceResult {
  const turn = state.turns.find((t) => t.turnId === turnId && t.hasReply);
  if (turn) {
    return { state, ops: [{ op: "append-delta", key: turn.key, delta }] };
  }
  // Chunk before its start — open the reply, then append. Deltas are still
  // addressed by turnKey, so this never leaks into another live turn's bubble.
  const started = reduceReplyStart(state, turnId);
  const opened = started.state.turns.find((t) => t.turnId === turnId);
  const ops: RenderOp[] = [...started.ops];
  if (opened) ops.push({ op: "append-delta", key: opened.key, delta });
  return { state: started.state, ops };
}

/** Reset to an empty transcript (the "clear conversation" action). */
export function reduceClear(_state: TranscriptState): ReduceResult {
  return { state: createTranscriptState(), ops: [] };
}
