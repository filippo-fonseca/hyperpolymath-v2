// Verbatim port of apps/web/lib/voice/sentence-splitter.ts (also mirrored in
// apps/desktop/src/audio/sentence-splitter.ts). The algorithm is a literal
// copy so that bug-fixes in one location apply to all; DO NOT diverge.

/** Result of splitting one delta-tick of accumulated text. */
export interface SplitResult {
  /** Completed sentences (each retains its terminator: '. ', '! ', '? ', or '\n\n'). */
  sentences: string[];
  /** Unfinished tail to carry forward for the next call. */
  remainder: string;
}

const TERMINATOR = /([.!?] |\n\n+)/g;

/**
 * Pure sentence splitter for streaming Anthropic text deltas.
 * Concatenates `prevBuffer + newDelta`, scans for terminators in order of
 * appearance, emits each completed sentence (with its trailing terminator
 * attached), and returns the unfinished tail as `remainder`.
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
