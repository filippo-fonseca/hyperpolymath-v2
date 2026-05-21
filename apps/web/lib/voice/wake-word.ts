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

const WAKE_PATTERN =
  /^(?:hey|hi|ok|okay|yo|hello)?\s*(?:jarvis|jervis|jarvi|javis|jarvy|jarrvis|jarviz)\b[,.!?]?\s*/i;

/**
 * If the transcript begins with a wake phrase, return the remainder
 * (the command portion). If no wake phrase, return null.
 *
 *   "hey jarvis, buy milk"  → "buy milk"
 *   "jarvis what time is it" → "what time is it"
 *   "hey jarvis"            → ""           (wake phrase only — no command)
 *   "buy milk"              → null         (no wake phrase — not for JARVIS)
 */
export function stripWakeWord(transcript: string): string | null {
  const match = transcript.match(WAKE_PATTERN);
  if (!match) return null;
  return transcript.slice(match[0].length).trim();
}
