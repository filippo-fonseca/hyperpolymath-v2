// apps/desktop/src/conversation/transcript-order.ts
// Pure, DOM-free turn-pairing for the Studio HUD conversation transcript.
//
// THE DEFECT this replaces: the old single-pair state machine in main.ts
// (turnPairState + one `jarvisTurnAwaitingUser` slot + one global
// `currentReplyBody`) could only represent ONE open user↔reply pair at a time.
// When two turns overlap — a partial-utterance turn and the full-question turn,
// each with its own server turnId — the events interleave at the client:
//
//   user_A → reply_A_start → user_B → reply_B_start → …deltas for A and B…
//
// With one parking slot and one "current" reply body, bubbles inserted in the
// wrong sibling order and streamed deltas from two live turns wrote into
// whichever bubble happened to be "current". The transcript read out of order.
//
// THE MODEL here: an ordered list of TURNS, each turn owning up to two sibling
// bubbles — a user bubble then its reply bubble. A reply ALWAYS renders under
// ITS user turn even if a later turn's reply-start arrives first. Reducer facts:
//
//   • Reply events (start/chunk) carry a stable server `turnId`. Deltas route to
//     the bubble keyed by THAT turnId — never a global "current" pointer, so two
//     live turns never share a writer.
//   • User echoes (the SSE `transcript` event and the POST fallback) do NOT
//     carry a turnId — the server emits the transcript event moments before it
//     mints the turnId (see voice/transcript/route.ts). They are paired to a
//     turn by ARRIVAL ORDER (FIFO): a reply-start fills the oldest user turn
//     still lacking a reply; a user echo fills the oldest reply-first turn still
//     lacking a user bubble. Server per-turn ordering is sequential
//     (transcript → start, per turn), so FIFO binds each reply to its own user.
//   • A reply with no waiting user turn opens a NEW reply-first turn; its user
//     echo, when it lands, slots ABOVE that reply within the same turn.
//   • A user echo with no reply-first turn to fill opens a NEW user-first turn.
//
// The reducer is a PURE function (state in, {state, ops} out): it emits ordered
// RenderOps that main.ts replays against the DOM. Each op names a stable bubble
// id and an optional `beforeId` anchor, so main.ts holds NO ordering logic — it
// only maps a bubble id to an element and inserts/writes. That keeps every
// interleaving unit-testable with zero DOM and preserves the invariant "exactly
// one writer per bubble body".

/** A monotonic, reducer-assigned key identifying a turn. Distinct from the
 *  server turnId (which only replies carry) so user-first turns are addressable
 *  before their reply's turnId exists. */
export type TurnKey = string;

/** Stable id of a single bubble element (`${turnKey}:user` / `${turnKey}:reply`). */
export type BubbleId = string;

export function userBubbleId(key: TurnKey): BubbleId {
  return `${key}:user`;
}
export function replyBubbleId(key: TurnKey): BubbleId {
  return `${key}:reply`;
}

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

/** DOM operations the reducer asks main.ts to perform, in order.
 *  `beforeId` is the id of the existing bubble the new bubble must render
 *  ABOVE (null = append at the end of the transcript). Deltas address a bubble
 *  by its stable id — never a "current" pointer. */
export type RenderOp =
  | { op: "create-user"; id: BubbleId; text: string; beforeId: BubbleId | null }
  | { op: "create-reply"; id: BubbleId; beforeId: BubbleId | null }
  | { op: "append-delta"; id: BubbleId; delta: string };

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

/** The bubble id that renders first for the turn at `index + 1` (the anchor a
 *  new turn's bubbles must go before), or null when `index` is the last turn. A
 *  turn's first bubble is its user bubble if present, else its reply. */
function anchorAfter(turns: Turn[], index: number): BubbleId | null {
  const next = turns[index + 1];
  if (!next) return null;
  return next.hasUser ? userBubbleId(next.key) : replyBubbleId(next.key);
}

/**
 * A user echo arrived (already deduped upstream by decidePaintEcho). Fill the
 * oldest reply-first turn still awaiting its user bubble (the user slots ABOVE
 * that turn's reply); if none, open a new user-first turn at the end.
 */
export function reduceUserEcho(state: TranscriptState, text: string): ReduceResult {
  const parkedIndex = state.turns.findIndex((t) => t.hasReply && !t.hasUser);
  const parked = parkedIndex === -1 ? undefined : state.turns[parkedIndex];
  if (parked) {
    const turns = state.turns.slice();
    const turn: Turn = { ...parked, hasUser: true };
    turns[parkedIndex] = turn;
    // The user bubble renders directly above its OWN reply bubble.
    return {
      state: { ...state, turns },
      ops: [{ op: "create-user", id: userBubbleId(turn.key), text, beforeId: replyBubbleId(turn.key) }],
    };
  }
  // No parked reply — a new user-first turn appended at the end.
  const { key, seq } = nextKey(state);
  const turn: Turn = { key, turnId: null, hasUser: true, hasReply: false };
  const turns = [...state.turns, turn];
  return {
    state: { turns, seq },
    ops: [{ op: "create-user", id: userBubbleId(key), text, beforeId: null }],
  };
}

/**
 * A reply started for `turnId`. Attach to the oldest user-first turn still
 * awaiting a reply; if none, open a new reply-first turn at the end. Idempotent:
 * a duplicate response-start for a turnId already bound returns no ops.
 */
export function reduceReplyStart(state: TranscriptState, turnId: string): ReduceResult {
  const boundIndex = state.turns.findIndex((t) => t.turnId === turnId && t.hasReply);
  if (boundIndex !== -1) {
    return { state, ops: [] };
  }
  const waitingIndex = state.turns.findIndex(
    (t) => t.hasUser && !t.hasReply && t.turnId === null,
  );
  const waiting = waitingIndex === -1 ? undefined : state.turns[waitingIndex];
  if (waiting) {
    const turns = state.turns.slice();
    const turn: Turn = { ...waiting, turnId, hasReply: true };
    turns[waitingIndex] = turn;
    // The reply renders directly under its user bubble: anchor before the NEXT
    // turn's first bubble (null = append at the end of the transcript).
    const beforeId = anchorAfter(turns, waitingIndex);
    return {
      state: { ...state, turns },
      ops: [{ op: "create-reply", id: replyBubbleId(turn.key), beforeId }],
    };
  }
  // Reply-first: open a new turn at the end. Its user echo (if any) slots above.
  const { key, seq } = nextKey(state);
  const turn: Turn = { key, turnId, hasUser: false, hasReply: true };
  const turns = [...state.turns, turn];
  return {
    state: { turns, seq },
    ops: [{ op: "create-reply", id: replyBubbleId(key), beforeId: null }],
  };
}

/**
 * A streamed delta for `turnId`. Routes to the bubble keyed by that turnId —
 * never a global "current". If no reply bubble exists yet (a chunk raced ahead
 * of its start), synthesize the start first so the delta has a home.
 */
export function reduceReplyDelta(
  state: TranscriptState,
  turnId: string,
  delta: string,
): ReduceResult {
  const turn = state.turns.find((t) => t.turnId === turnId && t.hasReply);
  if (turn) {
    return { state, ops: [{ op: "append-delta", id: replyBubbleId(turn.key), delta }] };
  }
  const started = reduceReplyStart(state, turnId);
  const opened = started.state.turns.find((t) => t.turnId === turnId);
  const ops: RenderOp[] = [...started.ops];
  if (opened) ops.push({ op: "append-delta", id: replyBubbleId(opened.key), delta });
  return { state: started.state, ops };
}

/** Reset to an empty transcript (the "clear conversation" action). */
export function reduceClear(_state: TranscriptState): ReduceResult {
  return { state: createTranscriptState(), ops: [] };
}
