// Loading-chatter filler generator — a small, prose-only Anthropic call that
// INTERPRETS a routine block's `loadingInstruction` into a short spoken filler
// line delivered WHILE the block gathers.
//
// Design notes:
// - Non-deterministic: temperature is high enough that wording varies each run
//   while staying semantically faithful to the instruction. It is never a
//   verbatim echo of the instruction text.
// - Prose-only: `tool_choice: { type: "none" }` — the agentic loop must not
//   route filler through the full `runJarvisTurnStream` (that forces a tool).
// - Cheap + fast: uses HAIKU_MODEL, short max_tokens. Errors are swallowed
//   (return null) — a missing filler must never break the routine.
// - Butler register: styled after JARVIS's opener palette in personality.ts,
//   but scoped to "we're fetching X, one moment".

import { getAnthropicClient, HAIKU_MODEL } from "@/lib/jarvis/anthropic-client";

const FILLER_SYSTEM = `You are JARVIS — a dry, British, formal butler assistant modeled on the Iron Man films. You speak aloud through a British TTS voice, so your output is PLAIN SPOKEN PROSE (no markdown, no lists, no emoji, no URLs).

You have been asked to generate ONE brief spoken filler line that plays WHILE a data source is being fetched, BEFORE the real result is back. Follow these rules exactly:

1. ONE sentence, at most ~15 words. Never longer. This is a bridge, not a briefing.
2. Address the user as "sir" when it fits naturally; do not overuse it.
3. The line describes what you are ABOUT TO DO or ARE DOING (present/continuous), never claims the result. You do not have the data yet.
4. INTERPRET the instruction — do not echo it verbatim. Vary wording and phrasing every time you are called, even for the same instruction.
5. Register: butler-dry, calm, slightly ceremonial. Occasional dry aside is fine when natural. Never sycophantic.
6. Never invent specifics you were not told (no times, no counts, no names not in the instruction).
7. Output ONLY the spoken line — no quotes, no prefix, no explanation.`;

/**
 * Generate a fresh, non-deterministic spoken filler line for a routine block
 * that has a `loadingInstruction`. Returns the trimmed line, or `null` on
 * failure (empty instruction, API error, empty response) so callers can just
 * skip the filler emit and let the routine keep going.
 */
export async function generateBlockFillerLine(opts: {
  apiKey: string;
  loadingInstruction: string;
  tool: string;
  routineName: string;
  abortSignal?: AbortSignal;
}): Promise<string | null> {
  const instruction = opts.loadingInstruction?.trim();
  if (!instruction) return null;

  const client = getAnthropicClient(opts.apiKey);

  const userMessage = `Routine: ${opts.routineName}
Data source being fetched: ${opts.tool}
Instruction for what to say while fetching: ${instruction}

Speak the filler line now.`;

  try {
    const response = await client.messages.create(
      {
        model: HAIKU_MODEL,
        max_tokens: 80,
        // High temperature so wording varies across runs for the same instruction.
        temperature: 1,
        system: FILLER_SYSTEM,
        // Prose only — the filler must never trigger a tool call.
        tool_choice: { type: "none" },
        messages: [{ role: "user", content: userMessage }],
      },
      opts.abortSignal ? { signal: opts.abortSignal } : undefined,
    );
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return null;
    // Strip a leading/trailing wrap quote if the model added one despite the rule.
    return text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim() || null;
  } catch (err) {
    console.error("[routine-filler] generation failed", err);
    return null;
  }
}
