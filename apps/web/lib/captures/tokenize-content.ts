/**
 * Shared tokenizer for rendering capture/task content with inline `#hashtag`
 * and `@person` chips.
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
 */

export type ContentSegment =
  | { kind: "text"; value: string }
  | { kind: "hashtag"; display: string }
  | { kind: "person"; display: string };

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
