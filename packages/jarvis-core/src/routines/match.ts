/**
 * Shared phrase matching for wake/utterance routine triggers. One source of
 * truth used by BOTH the desktop idle probe (registry) and the server-side
 * voice-transcript interception, so a phrase behaves identically wherever it
 * is matched.
 *
 * Voice-tolerant: lowercase, strip punctuation (so a trailing "." or the
 * apostrophe in "I'm" can't break a match), collapse whitespace. Matching is
 * space-padded whole-phrase inclusion, so "I'm back home." matches a raw
 * "im back home" transcript but not "homeowner".
 */
export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `text` contains `phrase` as a whole normalized phrase. */
export function phraseMatches(text: string, phrase: string): boolean {
  const needle = normalizePhrase(phrase);
  if (!needle) return false;
  return ` ${normalizePhrase(text)} `.includes(` ${needle} `);
}
