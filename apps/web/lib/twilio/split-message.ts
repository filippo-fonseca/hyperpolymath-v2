/**
 * split-message.ts — turn one assistant reply into as few text messages as
 * possible.
 *
 * A text channel has no streaming: the user gets whole messages, not deltas.
 * So the whole turn is joined server side and only then split, and the split
 * tries hard to land on a sentence boundary, because a reply cut mid-word
 * across two green bubbles reads as a bug.
 *
 * Order of preference for a break point:
 *   1. a sentence end (. ! ? … and their closing quotes/brackets)
 *   2. a line break
 *   3. any whitespace
 *   4. a hard cut, for a single unbroken run longer than the limit (a URL)
 *
 * Packing is greedy: keep adding whole sentences while they fit, so a 900-char
 * reply is one message rather than two.
 *
 * Pure and side-effect free.
 */

/**
 * Default per-message ceiling. Below the 1600-character cap Twilio enforces on
 * a single API call, with headroom so a segment never lands exactly on the
 * boundary.
 */
export const SMS_SEGMENT_LIMIT = 1500;

/** Split `text` into sentence-shaped chunks, each at most `limit` characters. */
export function splitSmsSegments(text: string, limit: number = SMS_SEGMENT_LIMIT): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= limit) return [normalized];

  const segments: string[] = [];
  let rest = normalized;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = findBreakPoint(window);
    const head = rest.slice(0, cut).trim();
    // findBreakPoint never returns 0, so `rest` always shrinks and this cannot
    // spin; the trim can still empty `head` if the window was all whitespace.
    if (head) segments.push(head);
    rest = rest.slice(cut).trim();
  }

  if (rest) segments.push(rest);
  return segments;
}

/**
 * Best break point inside `window`, as an index one past the last character to
 * keep. Falls back to the full window (a hard cut) when there is nothing to
 * break on, which is the right answer for a 2000-character URL.
 */
function findBreakPoint(window: string): number {
  // Sentence end, allowing a trailing quote or bracket, followed by whitespace.
  const sentence = lastMatchEnd(window, /[.!?…]["'”’)\]]*\s/g);
  if (sentence > 0) return sentence;

  const newline = window.lastIndexOf("\n");
  if (newline > 0) return newline + 1;

  const space = window.lastIndexOf(" ");
  if (space > 0) return space + 1;

  return window.length;
}

/** Index just past the last match of `re` in `s`, or 0 when there is none. */
function lastMatchEnd(s: string, re: RegExp): number {
  let end = 0;
  for (const match of s.matchAll(re)) {
    end = match.index + match[0].length;
  }
  return end;
}
