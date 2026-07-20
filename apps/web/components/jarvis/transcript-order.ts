// apps/web/components/jarvis/transcript-order.ts
// Deterministic ordering for the web JARVIS Console scrollback (issue #283).
//
// THE DEFECT this fixes: JarvisConsole.mergeById sorted the scrollback ONLY by
// `createdAt` milliseconds. A user turn and its assistant turn are two separate
// rows with independent ids and independently stamped `new Date()` timestamps
// created back-to-back inside a single handleSubmit — so they routinely share
// the SAME millisecond. A millisecond tie left the sort free to invert the pair,
// rendering JARVIS's reply ABOVE the question that prompted it. The same tie
// also survives a reload: loadJarvisHistoryPage orders rows `desc(createdAt)` in
// Postgres, whose order is nondeterministic on equal timestamps, so a tied pair
// can come back inverted from the DB too.
//
// THE MODEL here: a total, deterministic comparator that never inverts a pair.
//   1. `createdAt` milliseconds — primary chronological order.
//   2. On a millisecond TIE, a `user` turn always sorts before an `assistant`
//      turn. A same-instant user↔assistant pair is exactly the reported bug, and
//      the user always logically precedes its reply — so this fixes the pair
//      inversion regardless of source (live realtime merge OR a DB reload where
//      Postgres returned the tied pair in arbitrary order). It does not depend on
//      any persisted sequence, so it works for rows that never carried a client
//      seq.
//   3. On a tie of BOTH timestamp AND kind (two same-role turns in the same
//      millisecond — pathological, effectively impossible for a single human
//      typing), fall back to the monotonic client `seq` stamped at insertion so
//      ordering stays stable in true creation order rather than arbitrary.
//
// `nextTurnSeq` hands out that monotonic client sequence. Stamp it at every point
// a turn first enters the client (submit, desktop echo, server-relayed
// response-start, DB-row mapping) so the tier-3 tiebreak reflects insertion
// order. The comparator itself is a PURE function of its two arguments and is
// fully unit-testable (see transcript-order.test.ts).

import type { ScrollbackTurn } from "./jarvis-types";

/** Module-level monotonic counter backing the client insertion sequence. */
let seqCounter = 0;

/**
 * Next client insertion sequence. Monotonically increasing for the lifetime of
 * the module (one browser tab). Used only as the tier-3 tiebreak in
 * `compareTurns` — two turns sharing both a timestamp and a kind keep their true
 * creation order instead of an arbitrary one.
 */
export function nextTurnSeq(): number {
  seqCounter += 1;
  return seqCounter;
}

/**
 * Total, deterministic ordering comparator for scrollback turns.
 *
 * Order: `createdAt` ms, then `user` before `assistant` on a tie (so a
 * same-instant pair never inverts), then the client `seq` as a final stable
 * tiebreak. See the file header for the full rationale.
 */
export function compareTurns(a: ScrollbackTurn, b: ScrollbackTurn): number {
  const at = a.createdAt.getTime();
  const bt = b.createdAt.getTime();
  if (at !== bt) return at - bt;
  // Same millisecond: the user turn precedes its assistant reply. This is the
  // pair-inversion fix and holds under any arrival/fetch order.
  if (a.kind !== b.kind) return a.kind === "user" ? -1 : 1;
  // Same millisecond AND same kind: stable client insertion order. Missing seq
  // (e.g. an un-stamped legacy turn) sorts as 0, i.e. before any stamped turn,
  // which is a harmless deterministic default.
  const as = a.seq ?? 0;
  const bs = b.seq ?? 0;
  return as - bs;
}

/**
 * Return a new array of `turns` in canonical render order. A stable, non-mutating
 * sort (Array.prototype.sort is stable in modern engines and the comparator is a
 * total order anyway) so equal turns keep their input order.
 */
export function sortTurns(turns: ScrollbackTurn[]): ScrollbackTurn[] {
  return [...turns].sort(compareTurns);
}
