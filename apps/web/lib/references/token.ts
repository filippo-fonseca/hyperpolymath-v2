/**
 * The canonical entity-reference token — the one place its grammar is defined.
 *
 *     @[<label>](ref://<type>/<uuid>)
 *
 * A reference is plain text. It survives every path a string takes through this
 * app (a capture's `content`, a task's `notes`, the lossy markdown mirror of a
 * page, a JARVIS turn) without needing a parallel rich-text channel, and it
 * degrades to something a human can still read if nothing ever parses it.
 *
 * The `<uuid>` is the source of truth. The `<label>` is a display snapshot
 * taken at insert time: live renderers re-resolve the label from the entity,
 * and fall back to the snapshot only when the target is gone (tombstone) or
 * when nothing has hydrated it yet.
 *
 * Two rules everything downstream depends on:
 *
 *   1. Only COMPLETE matches are ever transformed. A prefix that could still
 *      become a token (`@[foo](ref://ta`) stays plain text. This is what makes
 *      the token safe to render mid-stream while JARVIS is still typing it:
 *      no half-formed chip ever flickers into the transcript.
 *   2. A label can hold any character except `]`, which would end the label
 *      early and desync the parse. `serializeReference` strips it.
 */

/** Every entity kind a token may point at. Events are excluded: they live in Google Calendar, not Postgres. */
export type EntityRefType =
  | "capture"
  | "task"
  | "page"
  | "project"
  | "area"
  | "person";

/** One parsed or insertable reference. */
export interface EntityRef {
  type: EntityRefType;
  /** The target entity's uuid — the durable half of the token. */
  id: string;
  /** Display snapshot of the target's title at insert time. */
  label: string;
}

/** A reference plus where it sat in the source string. */
export interface ParsedEntityRef extends EntityRef {
  /** Index of the token's first character. */
  start: number;
  /** Index one past the token's last character. */
  end: number;
}

/** One piece of a string split around its references. */
export type ReferenceSegment =
  | { kind: "text"; text: string }
  | { kind: "ref"; ref: EntityRef };

/** The ordered kinds, for anything that needs a stable iteration order. */
export const ENTITY_REF_TYPES: readonly EntityRefType[] = [
  "capture",
  "task",
  "page",
  "project",
  "area",
  "person",
] as const;

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The token grammar, as a source string, defined exactly once.
 *
 * Kept as source (not a literal) so `referenceTokenRe()` can hand out a fresh
 * instance per call. A shared `/g` regex carries mutable `lastIndex` state, and
 * two callers interleaving `.exec()` on one instance silently skip matches.
 */
export const REFERENCE_TOKEN_SOURCE = `@\\[([^\\]]*)\\]\\(ref://(${ENTITY_REF_TYPES.join(
  "|",
)})/(${UUID_SOURCE})\\)`;

/**
 * The canonical pattern, for reference and for callers that only need
 * `.test()`-style checks against a fresh clone. Prefer `referenceTokenRe()`
 * for any iteration: this instance is shared, and `/g` regexes are stateful.
 */
export const REFERENCE_TOKEN_RE = new RegExp(REFERENCE_TOKEN_SOURCE, "g");

/** A fresh, unshared global regex. Use this to scan a string. */
export function referenceTokenRe(): RegExp {
  return new RegExp(REFERENCE_TOKEN_SOURCE, "g");
}

/** True when `value` is a supported reference type. */
export function isEntityRefType(value: unknown): value is EntityRefType {
  return (
    typeof value === "string" &&
    (ENTITY_REF_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Render a reference to its canonical token.
 *
 * `]` is stripped from the label (it would terminate the label group early).
 * The uuid is lowercased because the grammar only admits lowercase hex — an
 * uppercase id would serialize into a token that `parseReferences` then refuses
 * to match, quietly breaking the round trip.
 */
export function serializeReference(ref: EntityRef): string {
  const label = ref.label.replace(/\]/g, "");
  return `@[${label}](ref://${ref.type}/${ref.id.toLowerCase()})`;
}

/**
 * Every complete reference in `text`, in source order, with its span.
 *
 * Incomplete or malformed tokens are not matches and are simply absent from
 * the result — callers treat whatever is not returned here as plain text.
 */
export function parseReferences(text: string): ParsedEntityRef[] {
  const re = referenceTokenRe();
  const out: ParsedEntityRef[] = [];
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    out.push({
      label: match[1],
      type: match[2] as EntityRefType,
      id: match[3],
      start: match.index,
      end: match.index + match[0].length,
    });
    match = re.exec(text);
  }
  return out;
}

/**
 * Split `text` into alternating plain-text and reference segments, losing
 * nothing: concatenating the text segments with each ref re-serialized
 * reproduces the input exactly.
 *
 * Empty text segments are omitted, so a string that is nothing but one token
 * yields a single `ref` segment.
 */
export function splitTextWithReferences(text: string): ReferenceSegment[] {
  const out: ReferenceSegment[] = [];
  let cursor = 0;
  for (const ref of parseReferences(text)) {
    if (ref.start > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, ref.start) });
    }
    out.push({
      kind: "ref",
      ref: { type: ref.type, id: ref.id, label: ref.label },
    });
    cursor = ref.end;
  }
  if (cursor < text.length) {
    out.push({ kind: "text", text: text.slice(cursor) });
  }
  return out;
}

/**
 * Replace every complete token with its label, leaving prose behind.
 * Used by preview/export paths that want readable text, not chips.
 */
export function stripReferences(text: string): string {
  return text.replace(referenceTokenRe(), (_full, label: string) => label);
}

/** Deduplicate refs by (type, id), keeping the first label seen. */
export function dedupeReferences<T extends EntityRef>(refs: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const ref of refs) {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/** Captures have no title, so their label is a synthesized first line. */
export const CAPTURE_LABEL_MAX = 80;

/**
 * Synthesize a capture's display label: its first non-empty line, truncated.
 *
 * Captures are the one referenceable entity with no title column — only free
 * `content` — so every surface that shows a capture chip has to agree on how
 * to invent one, or the same capture reads differently in two places.
 */
export function captureLabel(
  content: string,
  max: number = CAPTURE_LABEL_MAX,
): string {
  const firstLine =
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  if (firstLine.length <= max) return firstLine;
  return `${firstLine.slice(0, max - 1).trimEnd()}…`;
}
