/**
 * The bridge between a TipTap document and the canonical S1 reference token.
 *
 * Everything here is pure: no React, no TipTap runtime, no ProseMirror. The
 * editors hand this module plain doc JSON and get strings back, which is what
 * makes the round trip testable without standing up an editor in jsdom.
 *
 * THE TRAP THIS MODULE EXISTS TO AVOID (see jarvis-input-payload.ts's own note,
 * and the same bug in the captures/tasks save paths): TipTap wires a node's
 * `renderText` into the schema's `toText` serializer, but `doc.textContent` does
 * NOT consult it — it only honours native `leafText`. So an `entityMention` node
 * contributes NOTHING to `doc.textContent`, and a chip the user deliberately
 * inserted silently vanishes from the saved string. Every flatten path must walk
 * the JSON through `serializeEntityMentionNode` instead of reading textContent.
 */

import {
  type EntityRef,
  isEntityRefType,
  parseReferences,
  serializeReference,
} from "./token";

/** The TipTap node name. One constant so the schema and every walker agree. */
export const ENTITY_MENTION_NODE = "entityMention";

/**
 * The node's attributes.
 *
 * `refType`/`refId`/`refLabel` rather than the Mention extension's `id`/`label`:
 * a mention node's `id` means something different in every surface that ships
 * today (the captures composer stores a person's NAME there for resolve-or-
 * create; JARVIS stores a person's UUID), and reusing that name would inherit
 * the ambiguity the token was designed to end.
 */
export interface EntityMentionAttrs {
  refType: string | null;
  refId: string | null;
  label: string | null;
}

/** Minimal shape of a TipTap JSON node — only what the walkers read. */
interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
}

/** Read a node's attrs back into a well-formed ref, or null if it's malformed. */
export function entityMentionAttrsToRef(
  attrs: Record<string, unknown> | undefined,
): EntityRef | null {
  if (!attrs) return null;
  const { refType, refId, label } = attrs;
  if (!isEntityRefType(refType)) return null;
  if (typeof refId !== "string" || refId.length === 0) return null;
  return {
    type: refType,
    id: refId,
    label: typeof label === "string" ? label : "",
  };
}

/** The insertable node for a ref, as TipTap `insertContentAt` content. */
export function refToEntityMentionNode(ref: EntityRef): {
  type: string;
  attrs: EntityMentionAttrs;
} {
  return {
    type: ENTITY_MENTION_NODE,
    attrs: { refType: ref.type, refId: ref.id, label: ref.label },
  };
}

/**
 * The S1 token for an `entityMention` node, or null if the node isn't one (or
 * carries attrs too broken to serialize).
 *
 * Returning null rather than throwing keeps a corrupt node from taking down a
 * whole save: the walker just treats it as contributing nothing.
 */
export function serializeEntityMentionNode(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const n = node as DocNode;
  if (n.type !== ENTITY_MENTION_NODE) return null;
  const ref = entityMentionAttrsToRef(n.attrs);
  return ref ? serializeReference(ref) : null;
}

/** Every well-formed ref in a doc, in document order (duplicates kept). */
export function collectEntityMentionRefs(json: unknown): EntityRef[] {
  const out: EntityRef[] = [];
  walk(json, out);
  return out;
}

function walk(json: unknown, out: EntityRef[]): void {
  if (!json || typeof json !== "object") return;
  const n = json as DocNode;
  if (n.type === ENTITY_MENTION_NODE) {
    const ref = entityMentionAttrsToRef(n.attrs);
    if (ref) out.push(ref);
    return;
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) walk(child, out);
  }
}

/**
 * A run of stored text, split so callers can seed an editor: plain prose stays
 * a string (for the caller's own tokenizer to chew on — hashtags, legacy
 * `@person` names), and each complete token becomes an insertable node.
 *
 * Deliberately NOT coupled to `tokenize-content.ts`: references are recognised
 * FIRST and the leftover text runs are handed on, so a token's label can
 * contain a `#` or an `@` without the older tokenizer chipping the inside of a
 * reference.
 */
export type SeedSegment =
  | { kind: "text"; text: string }
  | { kind: "ref"; ref: EntityRef };

export function segmentTextForSeeding(text: string): SeedSegment[] {
  const out: SeedSegment[] = [];
  let cursor = 0;
  for (const ref of parseReferences(text)) {
    if (ref.start > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, ref.start) });
    }
    out.push({ kind: "ref", ref: { type: ref.type, id: ref.id, label: ref.label } });
    cursor = ref.end;
  }
  if (cursor < text.length) out.push({ kind: "text", text: text.slice(cursor) });
  return out;
}
