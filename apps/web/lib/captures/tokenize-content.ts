/**
 * Shared tokenizer for rendering capture/task content with inline entity
 * references, `#hashtag` chips, and `@person` chips.
 *
 * The previous card renderer split on whitespace and only pilled a token when
 * the WHOLE whitespace-delimited token matched `^#word$`, so punctuation-
 * adjacent tags (`#tag,`, `(#tag)`, `#a#b`) silently fell back to plain text —
 * tags "didn't appear well for all captures". This single-pass tokenizer scans
 * the raw string and emits chips for every `#…` regardless of surrounding
 * punctuation, using the same boundary rule as the composer/decoration/save
 * path (`/(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu`) so what pills always matches
 * what was persisted.
 *
 * `@person` chips are emitted only when the text after `@` matches a KNOWN
 * linked person name (longest-first). Raw `@` runs that don't match a person
 * (emails like `me@x.com`, handles) stay plain text — never auto-pilled.
 *
 * Reference tokens (`@[label](ref://type/uuid)`) are recognized FIRST, ahead of
 * both other rules, and their spans are skipped whole. That ordering is not a
 * preference: a token both starts with `@` and can carry anything in its label,
 * so scanning it character by character would let the person rule bite the
 * leading `@` and the hashtag rule chip a `#` *inside* a label. Matching the
 * complete token first and jumping past it makes a reference opaque — its label
 * is displayed, never re-parsed.
 *
 * Only complete tokens match (parseReferences' guarantee), so a half-typed or
 * half-streamed `@[foo](ref://ta` stays plain text until it finishes rather
 * than flickering into a broken chip.
 */

import { type EntityRef, parseReferences } from "@/lib/references/token";

export type ContentSegment =
  | { kind: "text"; value: string }
  | { kind: "hashtag"; display: string }
  | { kind: "person"; display: string }
  /** A complete reference token. `ref.label` is the insert-time snapshot. */
  | { kind: "entityRef"; ref: EntityRef };

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[\p{L}\p{N}_]/u.test(ch);
}

const HASHTAG_AT = /^#([\p{L}\p{N}_]+)/u;

export interface TokenizeOptions {
  /** lowercase canonical name → displayName (first-seen casing) for hashtags. */
  hashtagDisplay?: Map<string, string>;
  /** Known linked person display names. Only these get `@`-pilled. */
  personNames?: string[];
}

export function tokenizeContent(
  content: string,
  opts: TokenizeOptions = {},
): ContentSegment[] {
  const { hashtagDisplay, personNames } = opts;

  // Match the longest person name first so `@John Smith` wins over `@John`.
  const people = (personNames ?? [])
    .filter((n) => n.length > 0)
    .map((name) => ({ name, lower: name.toLowerCase() }))
    .sort((a, b) => b.name.length - a.name.length);

  // Complete reference tokens, in source order. Resolved up front so the walk
  // below can jump over each one whole instead of trying to recognize a
  // multi-part grammar a character at a time.
  const refs = parseReferences(content);
  let nextRef = 0;

  const segments: ContentSegment[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer) {
      segments.push({ kind: "text", value: buffer });
      buffer = "";
    }
  };

  while (i < content.length) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : undefined;
    const atBoundary = !isWordChar(prev);

    // Drop any reference the cursor has already passed. Nothing should be able
    // to step over a token's start today (a hashtag's alphabet excludes `@` and
    // `[`, and a person name matching a token's opening is absurd), but a stale
    // cursor here would silently mis-place a later chip, so it self-corrects.
    while (nextRef < refs.length && refs[nextRef].start < i) nextRef += 1;

    // References win over every other rule, and consume their whole span, so
    // nothing inside a label is ever tokenized as anything else.
    const ref = refs[nextRef];
    if (ref && i === ref.start) {
      flush();
      segments.push({
        kind: "entityRef",
        ref: { type: ref.type, id: ref.id, label: ref.label },
      });
      i = ref.end;
      nextRef += 1;
      continue;
    }

    if (ch === "#" && atBoundary) {
      const m = HASHTAG_AT.exec(content.slice(i));
      if (m?.[1]) {
        flush();
        const lower = m[1].toLowerCase();
        segments.push({ kind: "hashtag", display: hashtagDisplay?.get(lower) ?? m[1] });
        i += m[0].length;
        continue;
      }
    }

    if (ch === "@" && atBoundary && people.length > 0) {
      const rest = content.slice(i + 1);
      const restLower = rest.toLowerCase();
      const match = people.find(
        (p) =>
          restLower.startsWith(p.lower) &&
          // The next char after the name must not extend a word, so `@Jon`
          // doesn't match a person named "Jo".
          !isWordChar(rest[p.name.length]),
      );
      if (match) {
        flush();
        segments.push({ kind: "person", display: match.name });
        i += 1 + match.name.length;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return segments;
}
