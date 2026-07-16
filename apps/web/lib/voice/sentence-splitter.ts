/**
 * Phase 10 Plan 10-02 — LAT-02 client-side sentence-boundary splitter.
 *
 * Pure function `splitDeltas(prevBuffer, newDelta)` consumed by the JarvisConsole
 * / GlobalJarvisHandler SSE text-delta loop so each completed sentence can
 * dispatch to `/api/jarvis/tts` as soon as its terminator arrives, instead of
 * waiting for stream close. The caller owns the rolling buffer.
 *
 * D-02 (locked in 10-CONTEXT.md):
 *   - Split on the literal regex from REQUIREMENTS: `. `, `! `, `? `, `\n\n+`.
 *   - NO library (no `sbd`), NO abbreviation handling (`Mr.`/`Dr.`/`Inc.`).
 *   - NO minimum-length gate — first-syllable latency IS the headline metric;
 *     a 4-char sentence like "Filed." dispatches as soon as the boundary lands.
 *   - Trailing unfinished tail is retained as `remainder` for the next call.
 *     The consumer flushes whatever survives in `remainder` when the stream
 *     closes (so the last unterminated fragment still speaks).
 *
 * Known limitation (accepted per <deferred> in 10-CONTEXT.md): the literal `. `
 * boundary splits abbreviations like "Mr." into a false sentence. JARVIS
 * register is butler-clipped and does not produce these constructions, so the
 * cost is theoretical. Revisit if future quote-back / read-aloud features need
 * abbreviation-aware splitting.
 *
 * Usage pattern (caller owns the buffer):
 *   let buffer = "";
 *   // per delta:
 *   const { sentences, remainder } = splitDeltas(buffer, delta);
 *   buffer = remainder;
 *   for (const s of sentences) playSentence(s, seq++);
 *   // on stream close:
 *   if (buffer.trim()) playSentence(buffer, seq++);  // final flush
 */

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
 * Per D-02 (REQUIREMENTS literal) + Unit 3 hardening:
 *   - the `[.!?] ` half catches the three single-character sentence-enders
 *     followed by exactly one space (the trailing space is part of the
 *     terminator so the emitted sentence keeps its natural cadence).
 *   - the `[.!?](?=[A-Z"'])` half breaks a sentence-ender immediately followed
 *     (NO space) by an uppercase letter or an opening quote. This fixes the
 *     run-on glue where two utterances concatenate as `"…send one.Just Tita"`
 *     (defect 3a) — the lookahead does NOT consume the next char, so "Just"
 *     stays with the following sentence. Digits are excluded, so decimals like
 *     "1.5 hours" never split.
 *   - the `\n\n+` half catches paragraph breaks (one or more blank lines
 *     collapsed into one terminator).
 *
 * The capture group keeps the terminator string available to the splitter
 * so it can be re-attached to the preceding sentence — playback wants the
 * trailing punctuation/space for prosody.
 */
const TERMINATOR = /([.!?] |[.!?](?=[A-Z"'])|\n\n+)/g;

/**
 * Pure sentence splitter for streaming Anthropic text deltas.
 *
 * Concatenates `prevBuffer + newDelta`, scans for terminators in order of
 * appearance, emits each completed sentence (with its trailing terminator
 * attached), and returns the unfinished tail as `remainder`.
 *
 * No module-level mutable state; no closures; no I/O. Safe to call from any
 * context (Server Action, Server Component, client component, test).
 *
 * @param prevBuffer The unfinished tail from prior calls (start with "").
 * @param newDelta   The latest text-delta arrival from the SSE stream.
 * @returns SplitResult with completed sentences + unfinished tail.
 */
export function splitDeltas(
  prevBuffer: string,
  newDelta: string,
): SplitResult {
  // Fast path: an empty delta is a no-op. Returning prevBuffer untouched
  // keeps the caller's invariant simple — buffer = remainder always works.
  if (!newDelta) {
    return { sentences: [], remainder: prevBuffer };
  }

  const combined = prevBuffer + newDelta;
  const sentences: string[] = [];
  let lastEnd = 0;

  for (const match of combined.matchAll(TERMINATOR)) {
    // match.index is the start of the terminator; end is start + length.
    // `??` guard is for the (impossible-with-global-regex-on-string) case
    // where TypeScript still types `index` as optional.
    const end = (match.index ?? 0) + match[0].length;
    sentences.push(combined.slice(lastEnd, end));
    lastEnd = end;
  }

  const remainder = combined.slice(lastEnd);
  return { sentences, remainder };
}
