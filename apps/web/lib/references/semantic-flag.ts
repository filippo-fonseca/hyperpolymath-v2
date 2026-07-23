/**
 * The one gate for the semantic reference rung (U7).
 *
 * Semantic search is STAGED and additive: the exact FTS dropdown path (S4)
 * never waits on it, never regresses because of it, and — when this flag is
 * off, which is the default — pays nothing for it. Every semantic entry point
 * (the enqueue on write, the semantic search action, the dropdown's second
 * call) reads this first and no-ops when it returns false.
 *
 * Server-only. It reads a plain env var rather than a per-user setting because
 * the whole rung is a deployment-level capability toggle: embeddings have to be
 * generated (edge function deployed, backfill run) before results exist, so
 * there is nothing a single user could flip that would be meaningful on its own.
 */

/**
 * Whether the semantic reference rung is enabled for this deployment.
 *
 * Default OFF: only the literal string `"true"` enables it, so an unset,
 * empty, or malformed value degrades to the safe (exact-only) path.
 */
export function isReferencesSemanticEnabled(): boolean {
  return process.env.REFERENCES_SEMANTIC_ENABLED === "true";
}
