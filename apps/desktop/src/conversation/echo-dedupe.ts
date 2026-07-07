// apps/desktop/src/conversation/echo-dedupe.ts
// Pure decision logic for the user-voice-echo paint dedupe.
//
// The user's spoken text ("YOU …" line) is echoed into the HUD transcript from
// TWO sources, both describing the SAME utterance:
//   (a) the SSE `transcript` event  — the primary/fast path; ALWAYS carries an
//       `sttDoneAt` epoch-ms stamp set server-side at STT time.
//   (b) the POST /voice/transcript response (onTranscriptReceived) — a fallback
//       that currently arrives text-only (the web route omits sttDoneAt from the
//       normal-turn response; see the follow-up note in main.ts).
//
// Exactly ONE bubble must be painted per utterance (never double-paint), but the
// guard must NEVER DROP a legitimately new utterance — including one whose text
// is identical to an earlier one. Short confirmations ("yes", "no", "stop",
// "again", "go on") recur constantly in a hands-free conversation, and the old
// guard (normalized text within a fixed 15s window, single global slot) silently
// dropped every such repeat: the backend still ran the turn and JARVIS replied,
// so the user saw JARVIS act while their own line vanished. That is the bug this
// module fixes.
//
// Strategy — identity first, time only as a fallback:
//   1. Dedupe on a per-utterance IDENTITY (`sttDoneAt`) whenever present. This
//      is exact and TIME-INDEPENDENT: a genuine repeat has a fresh sttDoneAt so
//      it always paints; an exact replay (same sttDoneAt, e.g. an SSE
//      reconnect) never does. Because the SSE echo always carries an id, a
//      repeated utterance is reliably recognised as distinct and painted.
//   2. When identity is absent (the id-less POST fallback), fall back to a SHORT
//      text+recency window that collapses only the near-simultaneous SECOND echo
//      of the utterance just painted. Anything outside the window paints.
//   3. Ties break toward PAINTING (at-least-once) — a rare duplicate is strictly
//      better than a silent drop, which is the failure the owner reported.
//
// The decision function is pure (state passed in, no globals) so the SSE↔POST
// race and the repeat cases are unit-testable without a DOM.

/**
 * How long two echoes of the SAME utterance may be separated (id-less race).
 * Comfortably covers SSE↔POST arrival skew for one utterance while genuine
 * repeats are handled by identity (they carry a distinct sttDoneAt), so a wide
 * value here never drops a real repeat in the common SSE path.
 */
export const SAME_UTTERANCE_WINDOW_MS = 4_000;

/** Retire recorded identities older than this so a long session's id set stays
 *  bounded. sttDoneAt (epoch-ms) is never reused, so pruning is safe. */
export const ID_TTL_MS = 10 * 60_000;

/** One echo arriving from a source (SSE `transcript` event or POST response). */
export interface EchoInput {
  /** The recognised user utterance text. */
  text: string;
  /** Per-utterance STT-completion stamp, shared across sources for the same
   *  utterance. Undefined/null when the source didn't provide one. */
  sttDoneAt?: number | null;
  /** Arrival time; injectable for tests. Defaults to Date.now(). */
  now?: number;
}

interface PaintedRef {
  /** Normalized text of the last-painted echo. */
  text: string;
  /** When it was painted. */
  at: number;
  /** Its identity, if known (may be backfilled when the other source lands). */
  id: number | null;
}

export interface EchoDedupeState {
  /** Identities already painted → the time each was recorded (for pruning). */
  ids: Map<number, number>;
  /** The most recently painted echo (for the id-less race guard). */
  last: PaintedRef | null;
}

/** Fresh, empty dedupe state. */
export function createEchoDedupeState(): EchoDedupeState {
  return { ids: new Map<number, number>(), last: null };
}

/** Normalize a transcript for duplicate comparison: trim, lowercase, collapse
 *  internal whitespace. Casing/spacing drift between the two sources then still
 *  compares equal. */
export function normalizeEcho(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function coerceId(sttDoneAt: number | null | undefined): number | null {
  return typeof sttDoneAt === "number" && Number.isFinite(sttDoneAt) ? sttDoneAt : null;
}

function pruneIds(state: EchoDedupeState, now: number): void {
  for (const [id, at] of state.ids) {
    if (now - at >= ID_TTL_MS) state.ids.delete(id);
  }
}

/**
 * Decide whether an incoming echo should be PAINTED, mutating `state` to record
 * the decision. Returns true to paint exactly one bubble, false to suppress a
 * duplicate. Pure aside from the explicit `state` it threads (no globals, no
 * DOM) so every source-ordering can be exercised in tests.
 */
export function decidePaintEcho(input: EchoInput, state: EchoDedupeState): boolean {
  const now = input.now ?? Date.now();
  const norm = normalizeEcho(input.text);
  // Empty text carries no utterance (no-speech is signalled separately and
  // never routes here) — nothing to paint.
  if (!norm) return false;

  const id = coerceId(input.sttDoneAt);

  let paint: boolean;
  if (id !== null && state.ids.has(id)) {
    // Exact same utterance already handled (both sources carried this id, or an
    // SSE reconnect replayed it). Time-independent — never repaint.
    paint = false;
  } else {
    const last = state.last;
    const withinWindow =
      last !== null && last.text === norm && now - last.at < SAME_UTTERANCE_WINDOW_MS;
    if (withinWindow) {
      // Same text, moments apart. Paint ONLY if identity proves these are two
      // distinct utterances; otherwise treat it as the other source's echo of
      // the one just painted.
      const provablyDistinct = id !== null && last!.id !== null && last!.id !== id;
      paint = provablyDistinct;
      if (!paint && id !== null && last!.id === null) {
        // Backfill the just-painted (id-less POST) echo with the identity the
        // SSE now supplies, so a subsequent genuine repeat is recognised as
        // distinct regardless of which source arrived first.
        last!.id = id;
      }
    } else {
      paint = true;
    }
  }

  if (id !== null) {
    pruneIds(state, now);
    state.ids.set(id, now);
  }
  if (paint) {
    state.last = { text: norm, at: now, id };
  }
  return paint;
}
