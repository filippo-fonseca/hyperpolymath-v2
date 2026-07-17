import { createHash } from "node:crypto";

/**
 * The normalized text an entity is embedded from, and the hash that decides
 * whether it needs re-embedding (U7).
 *
 * ONE normalization is the whole point. The web side normalizes an entity's
 * text and hashes it to decide whether anything changed (the short-circuit);
 * the edge function embeds that same normalized text and stores `sha256(text)`
 * as the row's `content_hash`. Because the function is handed the already
 * normalized string and hashes exactly what it embeds, the two hashes agree by
 * construction — there is a single normalization implementation (this file,
 * pinned by a vitest), not a pair that can silently drift apart.
 *
 * The normalization itself is deliberately lossy and cheap: it exists to make
 * "did the meaning-bearing text change" a stable equality check and to keep the
 * embed input inside a sane token budget, not to preserve the source verbatim.
 */

/**
 * Longest normalized string we embed. gte-small tops out at 512 tokens; ~2k
 * characters of prose is comfortably inside that after tokenization, and the
 * head of an entity's text carries its topic. A capped length also bounds the
 * short-circuit hash's cost on very long pages.
 */
export const EMBEDDING_INPUT_MAX_CHARS = 2000;

/**
 * Fold an entity's title and body into the single normalized string it gets
 * embedded from.
 *
 * Title leads (it's the strongest topic signal), then the body. Everything is
 * lowercased, every run of whitespace collapses to one space, and the result is
 * trimmed and capped. The transform is total: nullish parts drop out, and an
 * entity with no text at all normalizes to `""` (its caller decides whether an
 * empty input is worth embedding).
 */
export function normalizeEmbeddingInput(
  title: string | null | undefined,
  body: string | null | undefined,
): string {
  const joined = [title, body]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(" ");
  const collapsed = joined.replace(/\s+/g, " ").trim().toLowerCase();
  return collapsed.slice(0, EMBEDDING_INPUT_MAX_CHARS);
}

/**
 * The content hash for a normalized embed input — hex sha256.
 *
 * Mirrored function-side as `sha256(content)` over the SAME normalized string,
 * so an unchanged entity produces an unchanged hash and the enqueue skips the
 * round trip. Hex (not base64) to match how the column is compared as plain
 * text and to stay trivially reproducible in Deno's Web Crypto.
 */
export function embeddingContentHash(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
