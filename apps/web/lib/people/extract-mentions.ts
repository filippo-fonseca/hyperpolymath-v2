/**
 * Extract the set of referenced person ids from editor content (Phase C).
 *
 * Both editors persist person mentions as inline nodes of a known type carrying
 * a `personId` prop/attr. On save we walk the document, collect the unique
 * non-empty ids, and hand them to reconcilePersonReferences so people_references
 * stays the single source of truth for what a page or capture references.
 */

interface InlineLike {
  type?: string;
  props?: { personId?: unknown };
  content?: unknown;
}

interface BlockLike {
  content?: unknown;
  children?: unknown;
}

/**
 * Walk a BlockNote document (an array of blocks) and return the unique
 * `personId`s carried by `personMention` inline nodes. Blocks may nest via
 * `children`; their `content` is the inline array we scan.
 */
export function extractPersonIdsFromBlockNote(doc: unknown): string[] {
  const ids = new Set<string>();

  function scanInline(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const inline = node as InlineLike;
    if (inline.type === "personMention") {
      const id = inline.props?.personId;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
  }

  function scanBlock(block: unknown): void {
    if (!block || typeof block !== "object") return;
    const b = block as BlockLike;
    if (Array.isArray(b.content)) b.content.forEach(scanInline);
    if (Array.isArray(b.children)) b.children.forEach(scanBlock);
  }

  if (Array.isArray(doc)) doc.forEach(scanBlock);
  return Array.from(ids);
}
