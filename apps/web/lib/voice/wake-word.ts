/**
 * Phase 7 — wake-word detection via VAD-gated Whisper transcript matching.
 *
 * Instead of a dedicated wake-word engine (Picovoice, openWakeWord), we
 * lean on the VAD + Groq Whisper pipeline already running: every detected
 * utterance gets transcribed, then we check if it starts with "hey jarvis"
 * (with common mishears). If so, we strip the prefix and treat the rest
 * as a command.
 *
 * Tradeoffs:
 *   - Every spoken utterance hits Groq STT (no on-device gating)
 *   - Free tier covers single-user use cases comfortably (60 RPM)
 *   - Latency ~500ms longer than a true wake-word engine (whole utterance
 *     must transcribe before we decide whether it's for JARVIS)
 *   - For multi-user / scale, swap to openWakeWord later — drop-in
 *     replacement for stripWakeWord's "is this for me?" gate
 *
 * Phrasings caught:
 *   - "hey jarvis", "hi jarvis", "ok jarvis", "okay jarvis", "yo jarvis",
 *     "hello jarvis", or just "jarvis" alone
 *   - Common Whisper mishears: "jervis", "javis", "jarvi", "jarvy"
 *   - Optional trailing punctuation (, . ! ?)
 */

// Require an explicit wake prefix (hey | hi | ok | …) followed by the JARVIS
// name. Bare "jarvis" used to match — Whisper occasionally hallucinates the
// name at the start of ambient speech, so we now demand both the prefix and
// the name with whitespace between them. The user has to actually say one of
// the wake phrases to activate.
const WAKE_PATTERN =
  /^(?:hey|hi|ok|okay|yo|hello|hej)\s+(?:jarvis|jervis|jarvi|javis|jarvy|jarrvis|jarviz)\b[,.!?]?\s*/i;

// Anywhere-in-string version of the wake pattern. Matches at the start OR
// after whitespace, so the command portion is everything AFTER the wake
// phrase even when the user rambled before saying it ("need to buy a Mac
// hey jarvis I need to buy a Mac" → "I need to buy a Mac").
const WAKE_PATTERN_ANYWHERE =
  /(?:^|\s)(?:hey|hi|ok|okay|yo|hello|hej)\s+(?:jarvis|jervis|jarvi|javis|jarvy|jarrvis|jarviz)\b[,.!?]?\s*/i;

/**
 * Normalize a Whisper transcript before wake-word matching.
 *
 * Whisper sometimes wraps short utterances in straight or curly quotes
 * (`"Hey Jarvis, buy milk."`) and may add leading/trailing whitespace.
 * Without stripping these, the anchored `^` regex sees a quote/space
 * before "hey" and fails to match.
 */
function normalize(transcript: string): string {
  return transcript
    .trim()
    .replace(/^["'“”‘’`]+/, "")
    .replace(/["'“”‘’`]+$/, "")
    .trim();
}

/**
 * If the transcript begins with a wake phrase, return the remainder
 * (the command portion). If no wake phrase, return null.
 *
 *   "hey jarvis, buy milk"  → "buy milk"
 *   "jarvis what time is it" → "what time is it"
 *   "hey jarvis"            → ""           (wake phrase only — no command)
 *   "buy milk"              → null         (no wake phrase — not for JARVIS)
 *
 * Tolerates surrounding quotation marks + whitespace that Whisper adds.
 */
export function stripWakeWord(transcript: string): string | null {
  const normalized = normalize(transcript);
  const match = normalized.match(WAKE_PATTERN);
  // DEBUG-FOLLOW-UP-LEAK: REMOVE BEFORE SHIPPING
  // eslint-disable-next-line no-console
  console.log("[DEBUG-LEAK] stripWakeWord internal", {
    rawTranscript: JSON.stringify(transcript),
    normalized: JSON.stringify(normalized),
    matched: !!match,
    matchedText: match ? JSON.stringify(match[0]) : null,
    pattern: WAKE_PATTERN.source,
  });
  if (!match) return null;
  return normalized.slice(match[0].length).trim();
}

/**
 * Like `stripWakeWord` but matches the wake phrase ANYWHERE in the
 * transcript and returns everything AFTER it. Anything spoken before
 * the wake phrase is discarded.
 *
 *   "buy a mac hey jarvis i need a mac" → "i need a mac"
 *   "hey jarvis buy milk"              → "buy milk"
 *   "hey jarvis"                        → ""
 *   "just rambling here"                → null
 *
 * Used by the Porcupine wake path (where VAD often captures audio
 * before the wake-word fires) and the follow-up path (so users who
 * habitually say "hey jarvis" inside the 5s window still get the
 * pre-phrase audio stripped).
 */
export function stripWakeWordAnywhere(transcript: string): string | null {
  const normalized = normalize(transcript);
  const match = normalized.match(WAKE_PATTERN_ANYWHERE);
  if (!match) return null;
  const idx = (match.index ?? 0) + match[0].length;
  return normalized.slice(idx).trim();
}
