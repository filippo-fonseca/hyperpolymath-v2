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

/**
 * Extract every bare link found in a run of plain text, normalized for storage
 * as a capture "URL" property entry. Uses the same detection as
 * `splitTextWithUrls` (so what renders as a clickable link in the body is
 * exactly what gets indexed), strips trailing sentence punctuation, runs each
 * candidate through `normalizeUrl`, and de-duplicates case-insensitively while
 * preserving first-seen order. Returns `[]` for empty / link-free input.
 */
export function extractUrlsFromContent(content: string | null | undefined): string[] {
  if (!content) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(URL_IN_TEXT_RE)) {
    const raw = match[0];
    const trailing = TRAILING_PUNCT_RE.exec(raw);
    const display = trailing ? raw.slice(0, raw.length - trailing[0].length) : raw;
    const normalized = normalizeUrl(display);
    if (!normalized) continue;
    // Cap at the same length the persistence contract enforces (2048) so a
    // derived link always round-trips back through validation on the next save.
    if (normalized.length > 2048) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

/** The persisted URL state for a capture: a primary link plus the full set. */
export interface CaptureUrlState {
  /**
   * Primary / canonical link — the backward-compatible single `url` column.
   * Seeded from the first known link only when it was previously unset; a
   * manually-set primary is never overwritten.
   */
  url: string | null;
  /** The full ordered, de-duplicated set of links (manual + body-derived). */
  urls: string[];
}

/**
 * Additively merge the links found in a capture's body into its existing URL
 * state. This is the single source of truth for the "auto-assign links from the
 * body" behavior, shared by every capture write path (web action, JARVIS
 * executor, device API) and the lazy view-time backfill.
 *
 * Guarantees:
 *   - **Never removes** a link already recorded (manual or previously derived).
 *   - **Never overwrites** a manually-set primary `url`.
 *   - **Adds** any body link not already present, in first-seen order.
 *   - De-duplicates case-insensitively via `normalizeUrl`, so a manual entry
 *     and its body twin collapse to one canonical href.
 *
 * @param content   the capture body to scan for links
 * @param existing  the current primary `url` and full `urls` set (either may be
 *                   omitted / null — treated as empty)
 */
export function mergeContentUrls(
  content: string | null | undefined,
  existing: { url?: string | null; urls?: string[] | null } = {},
): CaptureUrlState {
  const merged: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string | null | undefined): void => {
    const normalized = normalizeUrl(candidate ?? "");
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  };

  // Order matters: the existing primary stays canonical (first), then the rest
  // of the recorded set, then anything newly found in the body — all additive.
  push(existing.url);
  for (const u of existing.urls ?? []) push(u);
  for (const u of extractUrlsFromContent(content)) push(u);

  const primary = normalizeUrl(existing.url ?? "") ?? merged[0] ?? null;
  return { url: primary, urls: merged };
}

/**
 * Extract every bare URL from a text run as absolute hrefs, deduped and in order
 * of first appearance (issue #221). Optionally seed with an already-normalized
 * canonical URL (the capture's `url` property) so it participates in previews too.
 */
export function extractUrls(input: string, seed?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (href: string) => {
    if (!seen.has(href)) {
      seen.add(href);
      out.push(href);
    }
  };
  if (seed) {
    const normalized = normalizeUrl(seed);
    if (normalized) push(normalized);
  }
  for (const seg of splitTextWithUrls(input)) {
    if (seg.href) {
      // Normalize so the stored cache key matches the API lookup key exactly.
      const normalized = normalizeUrl(seg.href);
      if (normalized) push(normalized);
    }
  }
  return out;
}
