/**
 * Whole-page context serializer for in-document @JARVIS (Phase 31, JDOC-ENGINE-03).
 *
 * Per D-05 the WHOLE page is the model context on every invocation, serialized
 * from the LIVE editor document (never the lossy `pages.content` DB mirror,
 * which lags by one debounce cycle — Pitfall 3). The scoped target subset is
 * serialized separately so the model knows what "this/here" refers to.
 *
 * D-06: MAX_CONTEXT_CHARS is a generous SAFETY/DoS ceiling, not the normal
 * path — real pages fall far under it. D-07: this per-turn context is NOT
 * prompt-cached (run-turn.ts caches the system prompt only), so each invocation
 * pays the whole-page token cost in full. That is an accepted, eyes-open cost.
 */

import type { ScopeTarget } from "@/lib/jarvis/scope-resolver";

/**
 * ~12k tokens of slack. Whole pages normally fall far under this — it exists
 * purely as a defensive ceiling against pathologically long pages (D-06).
 * Mirrors the spirit of voice/text route's MAX_TEXT_CHARS bound.
 */
export const MAX_CONTEXT_CHARS = 48000;

export interface SerializedPageContext {
  /** Markdown of the scope target (what "this/here" refers to). */
  targetMarkdown: string;
  /** Markdown of the whole live page (for resolving "the above" etc.). */
  pageMarkdown: string;
  /** True if either field was clipped at the char cap. */
  truncated: boolean;
}

/**
 * Minimal structural editor surface so this function is testable with a fake
 * (no BlockNote instance required).
 */
type SerializerBlock = { id: string; children?: unknown[] };
type SerializerEditor = {
  document: SerializerBlock[];
  blocksToMarkdownLossy: (blocks: unknown[]) => Promise<string> | string;
};

const TRUNCATION_MARKER = "\n\n[…page truncated…]";

function clip(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars) + TRUNCATION_MARKER, truncated: true };
}

/**
 * Collect the block objects named by `blockIds`, searching top-level blocks and
 * one level of children. Returns them in document order; ids not found are
 * skipped. Each id is matched once.
 */
function collectBlocks(
  document: SerializerBlock[],
  blockIds: string[],
): SerializerBlock[] {
  const wanted = new Set(blockIds);
  const out: SerializerBlock[] = [];
  const seen = new Set<string>();
  const visit = (block: SerializerBlock) => {
    if (wanted.has(block.id) && !seen.has(block.id)) {
      out.push(block);
      seen.add(block.id);
    }
    if (Array.isArray(block.children)) {
      for (const child of block.children as SerializerBlock[]) visit(child);
    }
  };
  for (const block of document) visit(block);
  return out;
}

/**
 * Serialize the live whole page (capped) plus the scoped target subset.
 *
 * @param editor The live BlockNote editor (or a fake exposing document +
 *   blocksToMarkdownLossy).
 * @param scope  The resolved scope target (from resolveScope).
 * @param opts.maxChars Override the per-field char cap (defaults to
 *   MAX_CONTEXT_CHARS).
 */
export async function serializePageContext(
  editor: SerializerEditor,
  scope: ScopeTarget,
  opts?: { maxChars?: number },
): Promise<SerializedPageContext> {
  const maxChars = opts?.maxChars ?? MAX_CONTEXT_CHARS;

  // Whole page — always serialized in full regardless of scope kind (D-05).
  const rawPage = await editor.blocksToMarkdownLossy(editor.document);
  const page = clip(rawPage, maxChars);

  // Target subset. For kind "page" the target is the whole document, so reuse
  // the page serialization to avoid a redundant pass.
  let target: { text: string; truncated: boolean };
  if (scope.kind === "page") {
    target = page;
  } else {
    const targetBlocks = collectBlocks(editor.document, scope.blockIds);
    const rawTarget = await editor.blocksToMarkdownLossy(targetBlocks);
    target = clip(rawTarget, maxChars);
  }

  return {
    targetMarkdown: target.text,
    pageMarkdown: page.text,
    truncated: page.truncated || target.truncated,
  };
}
