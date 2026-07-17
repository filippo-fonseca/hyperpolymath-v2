/**
 * The pure, testable half of the semantic reference picker (U7).
 *
 * Lives outside app/actions/references-semantic.ts because a "use server" module
 * may only export async functions — these constants and helpers would each have
 * to become a server action otherwise. Keeping them here also lets vitest pin
 * the vector formatting and the tuning constants without a database.
 */

/**
 * Cosine-similarity floor for a semantic hit to be offered. UNTUNED: 0.75 is a
 * sane starting point for gte-small on short entity text, not a measured
 * threshold. Similarity rides back in the candidate payload (hidden in the UI)
 * precisely so this can be tuned later against real data rather than guessed
 * again. Higher = stricter (fewer, more-related hits); lower = looser.
 */
export const SEMANTIC_SIMILARITY_FLOOR = 0.75;

/** Most semantic hits returned in one call, across all kinds, best-first. */
export const SEMANTIC_TOP_K = 8;

/**
 * Shortest query that runs a semantic search. Below this the exact prefix match
 * is both cheaper and better; embedding one or two characters is noise. Matches
 * the directive's "query ≥ 3 chars" gate on the second dropdown call.
 */
export const SEMANTIC_MIN_QUERY_LENGTH = 3;

/**
 * Debounce for the semantic call (U7). Longer than the exact path's 120ms: the
 * exact results render immediately on every keystroke, and the semantic section
 * is a slower, best-effort addition, so it waits for a real pause in typing
 * before spending an embed round trip.
 */
export const SEMANTIC_SEARCH_DEBOUNCE_MS = 300;

/**
 * Format an embedding as a pgvector text literal: `[0.1,0.2,…]`.
 *
 * pgvector parses this text form when the value is cast `::vector`, which is how
 * the query vector reaches the `<=>` operator as a bound parameter rather than
 * being interpolated. NaN/Infinity can't occur in a normalized embedding, but a
 * malformed one would be rejected by the cast rather than silently mismatched.
 */
export function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(",")}]`;
}
