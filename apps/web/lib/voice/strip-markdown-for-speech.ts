/**
 * strip-markdown-for-speech — belt-and-braces sanitizer for the SPOKEN text path.
 *
 * The SPOKEN-OUTPUT CONTRACT (personality.ts) already instructs the model to
 * emit plain spoken prose with no markdown. This is the defense-in-depth layer:
 * even if a future prompt edit weakens the rule, or the model slips, no markdown
 * formatting token ever reaches TTS. It runs SERVER-SIDE on spoken deltas (see
 * run-turn.ts) so BOTH desktop and web voice benefit from one code path.
 *
 * HARD CONSTRAINT (spec §6): strip FORMATTING TOKENS ONLY, never words. Content
 * like "1.5 hours", "C. elegans", "e.g.", or a bare "$5" must survive verbatim.
 * We therefore anchor list/heading markers to line starts and only unwrap
 * emphasis when it clearly wraps text — we never touch mid-word punctuation.
 *
 * This is a PURE function (no I/O, no state): safe to call from any context and
 * trivially unit-testable.
 */

/**
 * Strip markdown formatting from a block of assistant text so it reads as plain
 * spoken prose. Idempotent: running it twice yields the same result.
 */
export function stripMarkdownForSpeech(text: string): string {
  if (!text) return text;

  let out = text;

  // 1. Fenced code blocks → drop the fences, keep any inner text as prose.
  out = out.replace(/```[a-zA-Z0-9]*\n?/g, "").replace(/```/g, "");

  // 2. Inline code / backticks → unwrap (keep the word, drop the backticks).
  out = out.replace(/`([^`]+)`/g, "$1").replace(/`/g, "");

  // 3. Bold / italic emphasis. Unwrap **bold**, __bold__, *italic*, _italic_.
  //    Anchor to non-space so we never eat a lone "*" used as a bullet (handled
  //    below) or a standalone underscore inside an identifier.
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  out = out.replace(/__([^_\n]+)__/g, "$1");
  out = out.replace(/\*([^*\n]+)\*/g, "$1");
  // Single-underscore italics: require word-ish boundaries so snake_case words
  // (e.g. "read_gmail") are NOT unwrapped/mangled.
  out = out.replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?;:])/g, "$1$2");

  // 4. Headings: a run of leading '#' at the start of a line → drop the marker.
  out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");

  // 5. Blockquotes: leading '>' at line start → drop.
  out = out.replace(/^[ \t]*>[ \t]?/gm, "");

  // 6. Unordered list markers at line start: '- ', '* ', '+ ' → drop the marker.
  //    Anchored to line start + a trailing space, so mid-sentence hyphens
  //    ("real-world") and "$5 * 3" arithmetic are untouched.
  out = out.replace(/^[ \t]*[-*+][ \t]+/gm, "");

  // 7. Ordered list markers at line start: '1. ', '2) ' → drop the marker.
  //    CRITICAL (spec §6): anchored to LINE START only, so decimals like
  //    "1.5 hours" and abbreviations like "C. elegans" mid-sentence survive.
  out = out.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");

  // 8. Links: [label](url) → speak just the label. Bare autolinks <url> → drop.
  out = out.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1");
  out = out.replace(/<https?:\/\/[^>\s]+>/g, "");

  // 9. Bare URLs → drop entirely (never spell a URL aloud).
  out = out.replace(/\bhttps?:\/\/[^\s)]+/g, "");

  // 10. Collapse whitespace artifacts left by removed tokens/URLs: a double
  //     space becomes one, trailing per-line spaces are trimmed, and 3+
  //     newlines collapse to a paragraph break. Newlines are preserved so the
  //     splitter still sees paragraph terminators.
  out = out.replace(/ {2,}/g, " ");
  out = out.replace(/[ \t]+$/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n");

  return out;
}
