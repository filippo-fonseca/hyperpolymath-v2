/**
 * Strip internal system tags from text that the user sees or hears.
 *
 * These bracketed markers are added on the wire before sending to the
 * model (clarification-reply depth cap, pre-parsed date/priority hints
 * — see app/api/jarvis/route.ts) but must never leak into the rendered
 * scrollback or the spoken TTS output. Also defends against the model
 * occasionally echoing a tag back in its prose.
 *
 *   "[CLARIFICATION REPLY] Task: plan weekend" → "Task: plan weekend"
 *   "[SYSTEM-PARSED PRIORITY — Set …] Handled, sir." → "Handled, sir."
 */
export function stripSystemTags(text: string): string {
  return text
    .replace(/^\s*\[CLARIFICATION REPLY\]\s*/i, "")
    .replace(/\[SYSTEM-PARSED PRIORITY[^\]]*\]/gi, "")
    .replace(/\[SYSTEM-PARSED DATES[^\]]*\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
