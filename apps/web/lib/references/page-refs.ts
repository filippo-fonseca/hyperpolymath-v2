import {
  type EntityRef,
  type EntityRefType,
  dedupeReferences,
  isEntityRefType,
} from "./token";

/**
 * Pulling references out of a page's block tree.
 *
 * A page keeps its references as inline nodes inside content_json, not as
 * tokens in prose: content_json is the editor's source of truth and `content`
 * is only a lossy markdown mirror (schema.ts:426-432). So reconciling a page
 * means walking the tree, never re-parsing the mirror — a reference dropped by
 * the mirror would silently unlink on save.
 *
 * Three node shapes, because they arrived at different times and nothing ever
 * unified them:
 *
 *   entityReference  { refKind, refId, label }   BlockNote, wiki pages
 *   personMention    { personId, name }          BlockNote, wiki pages
 *   entityMention    { refType, refId, label }   TipTap, the S6 universal node
 *
 * The walk is deliberately generic — it descends into anything, rather than
 * naming the containers it expects. The two hand-rolled walkers already in the
 * repo disagree about coverage (lib/people/extract-mentions.ts misses mentions
 * nested inside a link or a table cell; lib/pages/preview.ts handles links but
 * not table cells), and a reference that's invisible to the walker unlinks
 * itself the next time the page saves. Descending blindly costs one pass over
 * a tree that's already in memory and can't miss a container it hasn't heard of.
 */

/** BlockNote inline node for a non-person entity. */
export const ENTITY_REFERENCE_NODE = "entityReference";
/** BlockNote inline node for a person. */
export const PERSON_MENTION_NODE = "personMention";
/** TipTap inline node from the universal @-menu (S6). */
export const ENTITY_MENTION_NODE = "entityMention";

/** Guards against a pathological or hand-crafted tree. */
const MAX_DEPTH = 100;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Read one node as a reference, or null if it isn't one.
 *
 * TipTap keeps node data under `attrs`, BlockNote under `props`; both are
 * checked so one walker serves both editors. A node missing its id is dropped
 * rather than stored: an empty refId is the node spec's default (both specs
 * default it to ""), so a half-inserted node would otherwise reconcile into a
 * row pointing at nothing.
 */
export function nodeToReference(node: unknown): EntityRef | null {
  const record = asRecord(node);
  if (!record) return null;

  const type = record.type;
  if (typeof type !== "string") return null;

  const data = asRecord(record.props) ?? asRecord(record.attrs) ?? {};

  if (type === PERSON_MENTION_NODE) {
    const id = str(data.personId);
    if (!id) return null;
    return { type: "person", id, label: str(data.name) };
  }

  if (type === ENTITY_REFERENCE_NODE || type === ENTITY_MENTION_NODE) {
    // BlockNote's spec says refKind, TipTap's says refType.
    const kind = str(data.refKind) || str(data.refType);
    const id = str(data.refId);
    if (!id || !isEntityRefType(kind)) return null;
    return { type: kind as EntityRefType, id, label: str(data.label) };
  }

  return null;
}

/**
 * Every reference in a page's content_json, deduped by target, in document
 * order. Returns [] for a legacy page whose content_json is null, or for any
 * value that isn't a tree — a malformed doc must not throw on the save path.
 */
export function extractReferencesFromContentJson(
  contentJson: unknown,
): EntityRef[] {
  const found: EntityRef[] = [];

  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return;

    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }

    const record = asRecord(node);
    if (!record) return;

    const ref = nodeToReference(record);
    if (ref) found.push(ref);

    // Descend into every nested structure, whatever it's called: blocks,
    // inline content, table cells, link content, and anything a future node
    // type invents.
    for (const value of Object.values(record)) {
      if (typeof value === "object" && value !== null) visit(value, depth + 1);
    }
  };

  visit(contentJson, 0);
  return dedupeReferences(found);
}
