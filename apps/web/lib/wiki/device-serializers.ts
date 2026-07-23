import "server-only";

import { ServerBlockNoteEditor } from "@blocknote/server-util";

import { blocksWithReferenceTokens } from "@/lib/references/page-mirror";

/**
 * Server-side regeneration of a page's lossy markdown mirror (`pages.content`)
 * from its BlockNote `content_json`, for the device wiki API (issue #329).
 *
 * The web editor writes the mirror CLIENT-side in PageBlockEditor.onChange as
 * `editor.blocksToMarkdownLossy(blocksWithReferenceTokens(editor.document))`.
 * There is no shared server util for it, so per API-CONTRACT we reuse the pure
 * half (`blocksWithReferenceTokens`, which rewrites reference/mention nodes into
 * their canonical S1 tokens) and take the sanctioned `@blocknote/server-util`
 * fallback for the editor half (`ServerBlockNoteEditor.blocksToMarkdownLossy`).
 *
 * The web page schema adds custom blocks (callout, linkEmbed) and a custom
 * inline (jarvisReceipt) that the server-util default schema does not know —
 * feeding them to `blocksToMarkdownLossy` throws. References/mentions are
 * already flattened to text by the pre-pass; anything else custom is coerced to
 * a safe default (unknown block -> paragraph, unknown inline -> text) so the
 * lossy mirror is best-effort and the call never throws. content_json itself is
 * never mutated — the real nodes stay the source of truth.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Best-effort plain text of an inline-content node we are about to drop. */
function inlineNodeText(node: Record<string, unknown>): string {
  if (typeof node.text === "string") return node.text;
  if (typeof node.content === "string") return node.content;
  if (Array.isArray(node.content)) {
    return node.content
      .map((c) => (isRecord(c) && typeof c.text === "string" ? c.text : ""))
      .join("");
  }
  return "";
}

/**
 * Recursively coerce a block tree so every block type is in `knownBlocks` and
 * every inline-content node type is in `knownInline`. Unknown block types keep
 * their (normalized) content + children but become paragraphs; unknown inline
 * types collapse to a plain text node. Known nodes are still walked so a custom
 * node nested inside a known one is caught.
 */
function normalizeInline(content: unknown, knownInline: Set<string>): unknown {
  if (!Array.isArray(content)) return content;
  return content.map((node) => {
    if (typeof node === "string") return node;
    if (!isRecord(node)) return node;
    const type = typeof node.type === "string" ? node.type : "text";
    if (!knownInline.has(type)) {
      return { type: "text", text: inlineNodeText(node), styles: {} };
    }
    // `link` carries nested inline content; walk it too.
    if (Array.isArray(node.content)) {
      return { ...node, content: normalizeInline(node.content, knownInline) };
    }
    return node;
  });
}

function normalizeBlocks(
  blocks: unknown[],
  knownBlocks: Set<string>,
  knownInline: Set<string>,
): unknown[] {
  return blocks.map((block) => {
    if (!isRecord(block)) return block;
    const type = typeof block.type === "string" ? block.type : "paragraph";
    const out: Record<string, unknown> = { ...block };
    if (!knownBlocks.has(type)) {
      out.type = "paragraph";
      // Foreign props (e.g. a callout's) are invalid for a paragraph; drop them.
      delete out.props;
    }
    if (Array.isArray(block.content)) {
      out.content = normalizeInline(block.content, knownInline);
    }
    if (Array.isArray(block.children)) {
      out.children = normalizeBlocks(block.children, knownBlocks, knownInline);
    }
    return out;
  });
}

/**
 * Regenerate the markdown mirror from `content_json`. Returns "" for a null /
 * non-array document (legacy pages that only ever had markdown). Never throws.
 */
export async function contentJsonToMarkdown(contentJson: unknown): Promise<string> {
  if (!Array.isArray(contentJson)) return "";
  if (contentJson.length === 0) return "";

  const editor = ServerBlockNoteEditor.create();
  const knownBlocks = new Set(Object.keys(editor.editor.schema.blockSchema));
  const knownInline = new Set(Object.keys(editor.editor.schema.inlineContentSchema));

  // Flatten reference/mention nodes to their S1 tokens exactly as the web editor
  // does, then coerce any remaining custom nodes to safe defaults.
  const tokenized = blocksWithReferenceTokens(contentJson) as unknown[];
  const safe = normalizeBlocks(tokenized, knownBlocks, knownInline);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await editor.blocksToMarkdownLossy(safe as any);
  } catch {
    // Any residual shape server-util rejects: fall back to an empty mirror
    // rather than failing the save. content_json remains the source of truth.
    return "";
  }
}
