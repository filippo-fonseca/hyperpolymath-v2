/**
 * Pure helpers for the in-document @JARVIS trigger (Phase 32, JDOC-UX-01/02).
 *
 * Framework-free string logic backing the @ autocomplete and the prompt pill:
 *   - the completion target ("Jarvis") an `@J` query resolves to,
 *   - matching a partial `@`-query against the JARVIS suggestion item,
 *   - normalizing the raw pill text into the prompt sent to the seam.
 *
 * No React / DOM here so it stays unit-testable. The editor wiring imports these
 * to drive BlockNote's suggestion menu and to build the invokeInDocumentJarvis
 * `prompt` argument.
 */

/** Canonical completion label. Typing `@J` + Enter completes to `@Jarvis`. */
export const JARVIS_LABEL = "Jarvis";

/** The display token shown once an @Jarvis prompt pill is committed. */
export const JARVIS_TOKEN = `@${JARVIS_LABEL}`;

/** Aliases the @ suggestion menu accepts as matching the JARVIS item. */
export const JARVIS_ALIASES = ["jarvis", "j", "ai", "kiwi"] as const;

/**
 * Does the (post-@) query match the JARVIS suggestion item? Case-insensitive
 * prefix match against the label or any alias. An empty query matches (the menu
 * shows JARVIS the instant `@` is typed).
 */
export function matchesJarvisTrigger(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (JARVIS_LABEL.toLowerCase().startsWith(q)) return true;
  return JARVIS_ALIASES.some((a) => a.startsWith(q));
}

/**
 * Normalize raw pill text into the prompt sent to the seam. Strips a leading
 * `@Jarvis` (or `@J`-style) token and surrounding whitespace so the model
 * receives only the instruction. Idempotent and safe on already-clean text.
 *
 * Examples:
 *   "@Jarvis add a task to call mom" -> "add a task to call mom"
 *   "add a task"                     -> "add a task"
 *   "  @jarvis   qc p1  "            -> "qc p1"
 */
export function normalizePrompt(raw: string): string {
  if (!raw) return "";
  // Strip a single leading @<word> token (the invocation) plus following space.
  const stripped = raw.replace(/^\s*@[a-z]+\s*/i, "");
  return stripped.trim();
}

/**
 * Whether the raw pill text carries an actual instruction beyond the bare
 * invocation token. Submitting an empty prompt is a no-op the UI should ignore.
 */
export function hasPromptBody(raw: string): boolean {
  return normalizePrompt(raw).length > 0;
}
