/**
 * Rewriting a page's reference nodes into S1 tokens for the markdown mirror.
 *
 * The exact inverse-sibling of page-refs.ts: that walker reads references OUT
 * of content_json to reconcile them, this one writes them INTO `pages.content`
 * as canonical tokens. Both decide "is this node a reference, and what does it
 * point at" through the SAME function (nodeToReference), which is the point —
 * a node the walker links is a node the mirror serializes, with no second
 * definition to drift.
 *
 * WHY A PRE-PASS RATHER THAN A CUSTOM EXPORTER. BlockNote's markdown export is
 * driven by each inline spec's rendered DOM, so it already emits *something*
 * for these nodes — measured against 0.51.4, an entityReference becomes the
 * markdown link `[¶Marathon](/wiki/<id>)` (its render is an anchor) and a
 * personMention becomes the bare text `@Ada`. Neither is the contract: the
 * first carries an app-relative URL instead of a ref, and the second loses the
 * id entirely. So this is not filling a void, it is REPLACING a lossy form.
 *
 * Rewriting the tree to plain text nodes before serializing, rather than
 * teaching the exporter about our specs, buys three things: the transform is
 * pure and unit-testable without an editor, it reaches every node wherever it
 * sits (table cell, link, a container invented later), and it sidesteps
 * markdown escaping entirely. That last one is load-bearing and was measured,
 * not assumed: a token in a text node round-trips through the exporter's remark
 * stringify byte-identically for every adversarial label tried — empty,
 * `a*b*c`, `a_b_c`, `a (b) c`, `50% & <x>`, unicode, `a[b` — and survives bold
 * as `**<token>**`.
 *
 * The mirror is the contract for SEARCH and EXPORT, never for display: pages
 * render from content_json, and previews read the nodes directly. A token in
 * `pages.content` is there so a full-text search for a referenced entity finds
 * the page that names it, and so an export carries something a parser can
 * resolve back to an id.
 */

import { nodeToReference } from "./page-refs";
import { serializeReference } from "./token";

/** Matches the walker's guard against a pathological or hand-crafted tree. */
const MAX_DEPTH = 100;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A reference rendered as the inline text node that replaces it.
 *
 * `styles: {}` because a reference node is an atom that carries no styling of
 * its own; inheriting none keeps the token's own characters from being read as
 * emphasis on the way out.
 */
function tokenTextNode(text: string): Record<string, unknown> {
  return { type: "text", text, styles: {} };
}

/**
 * A deep copy of `blocks` with every reference node replaced by a text node
 * holding its canonical token. Everything else is passed through structurally
 * unchanged.
 *
 * The input is never mutated: this runs on `editor.document` while the editor
 * is live, and the document is the editor's own state, not ours to rewrite.
 * content_json must keep the real nodes — the mirror is the lossy copy.
 *
 * Replacement happens only on array elements, which is where inline content
 * lives; a reference node can appear nowhere else in a BlockNote tree.
 */
export function blocksWithReferenceTokens(blocks: unknown): unknown {
  const visit = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) return value;

    if (Array.isArray(value)) {
      return value.map((item) => {
        const ref = nodeToReference(item);
        if (ref) return tokenTextNode(serializeReference(ref));
        return visit(item, depth + 1);
      });
    }

    const record = asRecord(value);
    if (!record) return value;

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      out[key] = visit(child, depth + 1);
    }
    return out;
  };

  return visit(blocks, 0);
}
