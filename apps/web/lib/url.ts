/**
 * Shared URL helpers (issue #101).
 *
 * Two jobs:
 *   1. `normalizeUrl` — turn a user-typed string into a safe, persistable href
 *      for the Notion-style "URL" property on tasks / pages / captures. Prepends
 *      `https://` when no scheme is present, trims whitespace, and rejects
 *      anything that isn't a real http(s) URL (so `javascript:` / `data:` etc.
 *      never become a clickable link). Returns `null` for empty / invalid input.
 *   2. `splitTextWithUrls` — split a plain-text run into ordered text / url
 *      segments so render surfaces (the capture card body) can wrap bare URLs in
 *      real anchors without pulling in a dependency.
 */

// Matches a bare URL inside running text: an explicit http(s):// URL, or a
// www.-prefixed host. Trailing punctuation that's clearly sentence-level (not
// part of the link) is excluded by the character classes + the trim pass below.
const URL_IN_TEXT_RE =
  /(\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+)/gi;

// Trailing characters that are almost always punctuation, not part of the URL.
const TRAILING_PUNCT_RE = /[.,;:!?'")\]}>]+$/;

/**
 * Normalize a user-entered URL for storage as the entity "URL" property.
 *
 * - Trims surrounding whitespace.
 * - Empty string → null (clears the field).
 * - Prepends `https://` when the value has no scheme (so `example.com` works).
 * - Validates via the URL constructor and only accepts http / https.
 *
 * Returns the canonical href string, or null when the input is empty or not a
 * valid http(s) URL.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Add an `https://` scheme to a host-only href so it resolves as an absolute
 * link when used in an anchor's `href`. Stored URLs are already normalized, but
 * inline-detected `www.` URLs from content are not.
 */
export function ensureHref(url: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) return url;
  return `https://${url}`;
}

export interface UrlSegment {
  text: string;
  /** When set, this segment is a URL; `href` is the absolute link to open. */
  href?: string;
}

/**
 * Split a plain-text run into ordered segments, marking bare URLs. Plain text
 * segments carry only `text`; URL segments carry `text` (the display string, as
 * typed) plus `href` (the absolute link). Trailing sentence punctuation is
 * pushed back into the following text segment so links don't swallow it.
 */
export function splitTextWithUrls(input: string): UrlSegment[] {
  const segments: UrlSegment[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(URL_IN_TEXT_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;

    // Strip trailing punctuation off the matched URL and hand it back to text.
    const trailing = TRAILING_PUNCT_RE.exec(raw);
    const trail = trailing ? trailing[0] : "";
    const display = trail ? raw.slice(0, raw.length - trail.length) : raw;

    if (start > lastIndex) {
      segments.push({ text: input.slice(lastIndex, start) });
    }
    if (display) {
      segments.push({ text: display, href: ensureHref(display) });
    }
    if (trail) {
      segments.push({ text: trail });
    }
    lastIndex = start + raw.length;
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex) });
  }
  return segments;
}
