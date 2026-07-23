/**
 * Anthropic often emits separate text content blocks around tool_use
 * (preamble → tools → confirmation). Those chunks arrive on the `text`
 * stream with no separating whitespace, so the transcript glues as
 * "sir.Bedroom lights off" / "sir.Turning on…".
 *
 * Insert a single space when the prior chunk ends a sentence and the next
 * starts with a capital letter (and neither side already has whitespace).
 */
export function joinStreamTextChunks(prior: string, next: string): string {
  if (!next || !prior) return next;
  if (/\s$/.test(prior) || /^\s/.test(next)) return next;
  if (/[.!?]["')\]]*$/.test(prior) && /^[A-ZÀ-ÖØ-Þ]/.test(next)) {
    return ` ${next}`;
  }
  return next;
}
