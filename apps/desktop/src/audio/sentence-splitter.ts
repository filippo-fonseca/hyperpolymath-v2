// apps/desktop/src/audio/sentence-splitter.ts
// Verbatim port of apps/web/lib/voice/sentence-splitter.ts.
//
// Pure function splitDeltas(prevBuffer, newDelta) — see the web version for
// full documentation and design decisions. The algorithm is a literal copy
// so that bug-fixes in one location apply to both; DO NOT diverge the logic.

/** Result of splitting one delta-tick of accumulated text. */
export interface SplitResult {
  /** Completed sentences (each retains its terminator: '. ', '! ', '? ', or '\n\n'). */
  sentences: string[];
  /** Unfinished tail to carry forward for the next call. */
  remainder: string;
}

/**
 * Match a sentence terminator: `. `, `! `, `? `, `.`/`!`/`?` immediately before
 * an uppercase letter or quote, or one-or-more `\n\n`.
 *
 * Per D-02 (10-CONTEXT.md) + Unit 3 hardening:
 *   - `[.!?] ` catches three single-character sentence-enders followed by
 *     exactly one space (trailing space is part of the terminator).
 *   - `[.!?](?=[A-Z"'])` breaks a sentence-ender immediately followed (NO
 *     space) by an uppercase letter or opening quote — fixes run-on glue like
 *     `"…send one.Just Tita"` (defect 3a). The lookahead doesn't consume the
 *     next char, and digits are excluded so "1.5 hours" never splits.
 *   - `\n\n+` catches paragraph breaks (one or more blank lines collapsed
 *     into one terminator).
 *
 * The capture group keeps the terminator string available so it can be
 * re-attached to the preceding sentence for natural prosody.
 */
const TERMINATOR = /([.!?] |[.!?](?=[A-Z"'])|\n\n+)/g;

/**
 * Pure sentence splitter for streaming Anthropic text deltas.
 *
 * Concatenates `prevBuffer + newDelta`, scans for terminators in order of
 * appearance, emits each completed sentence (with its trailing terminator
 * attached), and returns the unfinished tail as `remainder`.
 *
 * No module-level mutable state; no closures; no I/O. Safe to call from
 * any context.
 *
 * @param prevBuffer The unfinished tail from prior calls (start with "").
 * @param newDelta   The latest text-delta arrival from the SSE stream.
 * @returns SplitResult with completed sentences + unfinished tail.
 */
export function splitDeltas(prevBuffer: string, newDelta: string): SplitResult {
  if (!newDelta) {
    return { sentences: [], remainder: prevBuffer };
  }

  const combined = prevBuffer + newDelta;
  const sentences: string[] = [];
  let lastEnd = 0;

  for (const match of combined.matchAll(TERMINATOR)) {
    const end = (match.index ?? 0) + match[0].length;
    sentences.push(combined.slice(lastEnd, end));
    lastEnd = end;
  }

  const remainder = combined.slice(lastEnd);
  return { sentences, remainder };
}
