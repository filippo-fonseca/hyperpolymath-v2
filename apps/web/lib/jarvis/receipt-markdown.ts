/**
 * The markdown serialization contract for in-document @JARVIS receipt pills
 * (Phase 32, JDOC-UX-06). Pure + framework-free so it can be unit-tested and
 * imported from both the (React) inline-content component and any export path.
 *
 * Receipt pills are BlockNote `content: "none"` inline content, so the markdown
 * mirror emits NOTHING for them — receipts never reach an export. This helper
 * pins the fenced shape that `stripReceipts` (lib/pages/markdown-export.ts)
 * removes, so any code path that ever does serialize a receipt produces a form
 * the export layer is guaranteed to delete.
 */

/** Wrap a receipt summary in the fenced HTML-comment region exports strip. */
export function receiptToMarkdownComment(summary: string): string {
  return `<!-- jarvis:receipt -->${summary}<!-- /jarvis:receipt -->`;
}
