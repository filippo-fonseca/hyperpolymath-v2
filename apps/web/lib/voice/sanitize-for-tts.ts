/**
 * sanitize-for-tts — normalize text just before it hits a TTS upstream.
 *
 * The problem this solves (user report): reading back a line like
 * `"I'm at the airport. — Jarvis"` produced a LONG awkward pause, because
 * ElevenLabs/Orpheus treat a bare em dash "—" as a heavy prosodic break. Any
 * stray markdown artifact (a lone `*`, a backtick, a raw link) is likewise
 * either spelled out or mangled aloud.
 *
 * This runs in the TTS route (api/jarvis/tts) on the FINAL text, right before
 * BOTH upstreams (ElevenLabs and the Groq/Orpheus fallback), so every caller
 * (desktop, browser, ESP32) gets clean prosody regardless of what it POSTed.
 * It layers on top of stripMarkdownForSpeech (the delta-path sanitizer) and is
 * safe to double-apply: idempotent, pure, no I/O.
 *
 * Rules:
 *  - em/en dashes → ", " (a comma gives a natural SHORT pause, not a long one).
 *  - strip markdown formatting tokens (reuse stripMarkdownForSpeech).
 *  - collapse repeated punctuation and whitespace so removed tokens don't leave
 *    doubled commas/periods or gaps.
 *  - quotes are left as-is (they read fine).
 */

import { stripMarkdownForSpeech } from "./strip-markdown-for-speech";

/**
 * Sanitize a block of text for spoken TTS. Pure and idempotent.
 */
export function sanitizeForTts(text: string): string {
  if (!text) return text;

  // 1. Markdown formatting tokens (bold/italic/code/headings/lists/links/URLs).
  //    Reuse the delta-path sanitizer so the two paths never drift.
  let out = stripMarkdownForSpeech(text);

  // 2. Em / en dashes (and the common " -- " ASCII stand-in) → ", ".
  //    A comma yields a natural short pause instead of the long dead air the
  //    upstreams give a raw dash. Surrounding spaces are absorbed so we don't
  //    leave " , " with a floating comma.
  out = out.replace(/\s*(?:—|–|--)\s*/g, ", ");

  // 3. Collapse repeated punctuation the dash swap (or the source) may have
  //    produced: ",," / ", ." / ".," etc. Keep the STRONGER mark when a comma
  //    abuts a sentence-ender, and dedupe runs of the same mark.
  out = out.replace(/,\s*([.!?;:])/g, "$1"); // ", ." → "."
  out = out.replace(/([.!?;:])\s*,/g, "$1"); // ". ," → "."
  out = out.replace(/,\s*(,\s*)+/g, ", "); // ", , ," → ", "
  out = out.replace(/([!?])\1+/g, "$1"); // "!!" → "!", "??" → "?" (leave "..." ellipsis intact)

  // 4. Whitespace tidy: collapse runs of spaces/tabs, trim per line, drop a
  //    leading comma left dangling at the very start.
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/[ \t]+$/gm, "");
  out = out.replace(/^\s*,\s*/, "");

  return out.trim();
}
