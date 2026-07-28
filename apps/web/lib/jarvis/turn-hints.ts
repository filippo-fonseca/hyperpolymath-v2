/**
 * turn-hints.ts — the single source of truth for how a raw user utterance
 * becomes (a) an Anthropic `tool_choice` and (b) the model-visible user
 * message with system hints appended.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This block used to live twice, copy-pasted verbatim: once in the browser
 * console route (`app/api/jarvis/route.ts`) and once in the paired-device text
 * route (`app/api/jarvis/voice/text/route.ts`). Both files carried a "keep the
 * two in sync" comment, which is the usual sign that they had already drifted
 * and would drift again. Adding a third text channel (SMS) would have made it
 * three copies.
 *
 * The rules encoded here:
 *   - `/task | /capture | /event` force the matching `create_*` tool.
 *   - `/ask`, or a bare meta-question ("what did I do today?"), forbids all
 *     tools so the turn answers in prose instead of filing something.
 *   - `/help` is client-rendered, so it carries no server-side override.
 *   - Client-parsed dates / priority / linked references are appended to the
 *     MODEL-VISIBLE message only. The persisted user turn stays clean, which is
 *     why the caller keeps the raw text and passes `userContent` to the model.
 *   - A reply to a previous `ask_clarification` gets a depth-cap hint so the
 *     model cannot ask again forever.
 *
 * Pure and side-effect free: no DB, no network, no environment reads. That
 * makes it unit-testable and safe to import from any channel.
 */

/** Slash commands the client can force. `help` renders locally, no override. */
export type SlashCommand = "task" | "capture" | "event" | "ask" | "help";

/** Anthropic tool_choice, narrowed to the three shapes JARVIS ever emits. */
export type TurnToolChoice = { type: "auto" } | { type: "none" } | { type: "tool"; name: string };

/** A client-parsed date hint, copied verbatim into the tool call by the model. */
export interface ParsedDateHint {
  text: string;
  start: string;
  end?: string;
  allDay?: boolean;
}

export interface TurnHintInput {
  /** The user's raw text, exactly as typed or transcribed. */
  input: string;
  slashCommand?: SlashCommand | null;
  parsedDates?: ParsedDateHint[];
  parsedPriority?: "P∞" | "P1" | "P2" | "P3";
  linkedProjectIds?: string[];
  linkedHashtags?: string[];
  linkedPeople?: Array<{ id: string; name: string }>;
  /**
   * Facts about the CHANNEL this turn arrived on that the model should know but
   * the user did not type: "this came in by text message, keep the reply
   * short", "two images were attached and you cannot open them". Appended to
   * the model-visible message only, so the persisted user turn stays the raw
   * utterance.
   */
  channelNotes?: string[];
}

export interface TurnHints {
  /** The message to SEND to the model (raw text + appended system hints). */
  userContent: string;
  /** The tool_choice for this turn. */
  toolChoice: TurnToolChoice;
  /** True when the turn is a prose answer rather than a filing action. */
  askMode: boolean;
  /** True when this turn replies to a prior `ask_clarification`. */
  isClarificationReply: boolean;
}

/**
 * Questions about existing state ("what did I do today?", "how many tasks…")
 * that must be answered in prose rather than filed as a new capture. Kept as a
 * conservative prefix match: it only fires at the START of the utterance, so
 * "Task: ask Rohan how many people are coming" is untouched.
 */
export const META_QUESTION_RE =
  /^(what\s+(?:did|do|does|are|is|was|were|have|will)|did\s+(?:i|we|you)|do\s+(?:i|we|you)|have\s+(?:i|we|you)|show\s+me|tell\s+me|list\s+|summari[sz]e|recap|how\s+many|how\s+much)\b/i;

/** The marker the console prepends when the user answers an ask_clarification. */
export const CLARIFICATION_REPLY_PREFIX = "[CLARIFICATION REPLY]";

/**
 * Build the tool_choice and the model-visible message for one turn.
 *
 * Behaviour is identical to the two hand-maintained copies this replaces; the
 * only widening is that `linkedPeople` and clarification-reply detection are
 * now available to every channel rather than to the browser console alone.
 */
export function buildTurnHints(opts: TurnHintInput): TurnHints {
  const { input } = opts;
  const slashCommand = opts.slashCommand ?? null;

  const bareMetaQuestion = !slashCommand && META_QUESTION_RE.test(input.trim());
  const askMode = slashCommand === "ask" || bareMetaQuestion;
  const isClarificationReply = input.trimStart().startsWith(CLARIFICATION_REPLY_PREFIX);

  const toolChoice: TurnToolChoice = askMode
    ? { type: "none" }
    : slashCommand && slashCommand !== "help"
      ? { type: "tool", name: `create_${slashCommand}` }
      : { type: "auto" };

  let userContent = input;
  if (opts.parsedDates && opts.parsedDates.length > 0) {
    userContent += `\n\n[SYSTEM-PARSED DATES — MANDATORY: copy these ISO strings verbatim into the relevant tool field (due/start/end). Do NOT call new Date() or re-parse. If allDay=true the user gave no time-of-day; use the start value as-is. ${JSON.stringify(opts.parsedDates)}]`;
  }
  if (opts.parsedPriority) {
    userContent += `\n\n[SYSTEM-PARSED PRIORITY — MANDATORY: the user typed an explicit priority token. Set create_task.priority to exactly "${opts.parsedPriority}". Do not default to P3.]`;
  }
  if (askMode) {
    userContent += `\n\n[META-QUESTION MODE${slashCommand === "ask" ? " (/ask)" : ""}: this turn answers a question; do NOT call any tool. Reply with 1-3 plain English sentences using the visible conversation history. The "OUTPUT FORMAT: emit tool calls only" rule does NOT apply this turn. Your prose IS the response and WILL render to the user.]`;
  }
  if (
    (opts.linkedProjectIds?.length ?? 0) > 0 ||
    (opts.linkedHashtags?.length ?? 0) > 0 ||
    (opts.linkedPeople?.length ?? 0) > 0
  ) {
    const parts: string[] = [];
    if (opts.linkedProjectIds && opts.linkedProjectIds.length > 0) {
      parts.push(`projects=${JSON.stringify(opts.linkedProjectIds)}`);
    }
    if (opts.linkedHashtags && opts.linkedHashtags.length > 0) {
      parts.push(`hashtags=${JSON.stringify(opts.linkedHashtags)}`);
    }
    if (opts.linkedPeople && opts.linkedPeople.length > 0) {
      parts.push(`people=${JSON.stringify(opts.linkedPeople)}`);
    }
    userContent += `\n\n[Linked references in this message (client-validated): ${parts.join(", ")}]`;
  }
  for (const note of opts.channelNotes ?? []) {
    if (note.trim()) userContent += `\n\n[CHANNEL NOTE: ${note.trim()}]`;
  }
  if (isClarificationReply) {
    userContent += `\n\n[INTERNAL: This message is a reply to your previous ask_clarification. Do NOT emit another ask_clarification this turn — execute the action now using the user's clarification, or fall back to capture-first if still ambiguous. Depth cap enforced (Pitfall 2).]`;
  }

  return { userContent, toolChoice, askMode, isClarificationReply };
}
