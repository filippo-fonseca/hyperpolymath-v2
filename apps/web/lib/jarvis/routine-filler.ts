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

import {
  correctLeadingGreeting,
  greetingForTimeOfDay,
  timeOfDayForHour,
  type TimeOfDay,
} from "@hyperpolymath/jarvis-core";

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

// Current wall-clock hour (0–23) in the given IANA timezone. Mirrors run-turn.ts's
// (unexported) `currentHourInTimezone`: hourCycle "h23" so midnight is 0, and the
// result is normalized into 0–23 so it is always safe to feed into timeOfDayForHour.
function currentHourInTimezone(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return Number.isFinite(h) ? ((h % 24) + 24) % 24 : 0;
}

/**
 * Derive the greeting contract inputs for a filler line from a user's local
 * timezone: the current part-of-day bucket, the matching greeting phrase, and a
 * human-readable 12h clock ("1:35 PM"). Exported so it is unit-testable in
 * isolation (with fake timers) and reusable by callers that precompute the tz.
 *
 * This is the SAME derivation run-turn.ts's temporal-context block uses; the
 * filler path needs it because the opener / per-block fillers are cheap Haiku
 * prose calls that BYPASS run-turn's greeting contract + guard.
 */
export function fillerTimeContext(timezone: string): {
  timeOfDay: TimeOfDay;
  greeting: string;
  clock: string;
} {
  const timeOfDay = timeOfDayForHour(currentHourInTimezone(timezone));
  const greeting = greetingForTimeOfDay(timeOfDay);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
  return { timeOfDay, greeting, clock };
}

/**
 * Generate a fresh, non-deterministic spoken filler line for a routine block
 * that has a `loadingInstruction`. Returns the trimmed line, or `null` on
 * failure (empty instruction, API error, empty response) so callers can just
 * skip the filler emit and let the routine keep going.
 *
 * Greeting correctness (bgsd/briefing-opener-greeting): when `timezone` is
 * provided, the current local time-of-day + matching greeting are injected into
 * the system prompt so ANY greeting the model opens with matches the local
 * clock, and the output is passed through `correctLeadingGreeting` as a
 * deterministic belt-and-braces guard so a contradicting LEADING greeting is
 * corrected even if the model slips. Without a timezone, behavior is unchanged.
 */
export async function generateBlockFillerLine(opts: {
  apiKey: string;
  loadingInstruction: string;
  tool: string;
  routineName: string;
  /** User's IANA timezone. Drives the greeting contract + deterministic guard. */
  timezone?: string;
  abortSignal?: AbortSignal;
}): Promise<string | null> {
  const instruction = opts.loadingInstruction?.trim();
  if (!instruction) return null;

  const client = getAnthropicClient(opts.apiKey);

  // Time-of-day greeting contract (only when a timezone is known).
  const timeCtx = opts.timezone ? fillerTimeContext(opts.timezone) : null;
  const system = timeCtx
    ? `${FILLER_SYSTEM}\n\n8. It is currently the ${timeCtx.timeOfDay} (${timeCtx.clock} local). If (and only if) you open with a time-of-day greeting, it MUST be "${timeCtx.greeting}". Never greet with any other part of the day.`
    : FILLER_SYSTEM;

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
        system,
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
    const cleaned = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
    if (!cleaned) return null;
    // Deterministic guard: correct a contradicting LEADING time-of-day greeting.
    return timeCtx ? correctLeadingGreeting(cleaned, timeCtx.timeOfDay) : cleaned;
  } catch (err) {
    console.error("[routine-filler] generation failed", err);
    return null;
  }
}
