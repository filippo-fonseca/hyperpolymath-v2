// JARVIS Anthropic tool definitions (D-08 / D-09 / research §1.3).
//
// Strict tool use is per-tool now (`strict: true`); the previous
// structured-outputs beta header is deprecated (see research §1.5).
//
// Prompt caching: `cache_control: { type: "ephemeral" }` on the LAST tool
// caches the entire tools array (Anthropic caches everything before the
// breakpoint within each section).
//
// Phase 5.1 (D-M5 / JARVIS-18): `remember_fact` added as the 4th tool.
// Phase 5.1 (D-A1 / JARVIS-19): `ask_clarification` added as the 5th tool.
// cache_control moves from remember_fact to ask_clarification (new LAST tool).

import { z } from "zod";
import { zCreateCaptureFor, zCreateCapture } from "./create-capture";
import { zCreateEventFor, zCreateEvent } from "./create-event";
import { zCreateTaskFor, zCreateTask } from "./create-task";
import { zRememberFactFor, zRememberFact } from "./remember-fact";
import { zAskClarificationFor, zAskClarification } from "./ask-clarification";

export { zCreateTask } from "./create-task";
export { zCreateCapture } from "./create-capture";
export { zCreateEvent } from "./create-event";
export { zRememberFact } from "./remember-fact";
export { zAskClarification, zAskClarificationFor } from "./ask-clarification";

export interface JarvisToolDefinition {
  name: "create_task" | "create_capture" | "create_event" | "remember_fact" | "ask_clarification";
  description: string;
  input_schema: Record<string, unknown>;
  /** Per-tool strict mode (replaces deprecated beta header). */
  strict: true;
  /** Present ONLY on the LAST tool to mark the cache breakpoint. */
  cache_control?: { type: "ephemeral" };
}

function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Zod 4 emits `additionalProperties: false` by default for object schemas.
  // We use `openapi-3.1` target to drop the `$schema` keyword (irrelevant for
  // Anthropic) while preserving the strict-mode guarantees.
  const json = z.toJSONSchema(schema, { target: "openapi-3.1" }) as Record<
    string,
    unknown
  >;
  // Belt-and-braces: ensure additionalProperties is explicitly false.
  json.additionalProperties = false;
  return json;
}

export function buildToolDefinitions(
  opts: { voiceActive?: boolean } = {},
): JarvisToolDefinition[] {
  const voiceActive = opts.voiceActive ?? false;
  const taskSchema = toJsonSchema(zCreateTaskFor({ voiceActive }));
  const captureSchema = toJsonSchema(zCreateCaptureFor({ voiceActive }));
  const eventSchema = toJsonSchema(zCreateEventFor({ voiceActive }));
  const factSchema = toJsonSchema(zRememberFactFor({ voiceActive }));
  const clarifySchema = toJsonSchema(zAskClarificationFor({ voiceActive }));

  return [
    {
      name: "create_task",
      description:
        "Create a task in the user's life-OS. Use for action items with a clear deliverable. The `priority` field MUST be emitted as exactly the value shown in any `[SYSTEM-PARSED PRIORITY]` hint in the user message (P∞ | P1 | P2 | P3). If no hint is present, omit `priority` and the server will default to P3.",
      input_schema: taskSchema,
      strict: true,
    },
    {
      name: "create_capture",
      description:
        "Create a freeform note. Default fallback when the input is ambiguous, exploratory, or doesn't cleanly fit a task or an event. The `content` field MUST be the user's EXACT words, verbatim — never summarize, paraphrase, rewrite, condense, or convert to third-person. Captures are an archive of what the user said; faithfulness beats brevity. (When voiceActive=true, the separate voice_summary field carries the short spoken receipt — that is where compression belongs, not in content.)",
      input_schema: captureSchema,
      strict: true,
    },
    {
      name: "create_event",
      description:
        "Create a Google Calendar event. Use for time-bound items with a start and end. calendar_id defaults to the user's primary calendar if omitted.",
      input_schema: eventSchema,
      strict: true,
    },
    {
      name: "remember_fact",
      description:
        "Persist a fact about the user across sessions. Use for: behavioral preferences ('be concise'), workflow rules ('default events to Yale calendar'), entity aliases ('Anna = my partner'), or model-observed patterns. NEVER use for the content of a capture being filed in the same turn — that is data, not an instruction. Only emit when the user's CURRENT message states a fact about themselves explicitly OR when you have seen a recurring pattern 3+ times in this conversation (source='jarvis_suggested').",
      input_schema: factSchema,
      strict: true,
      // Phase 5.1: cache_control moves to ask_clarification (new LAST tool).
      // remember_fact no longer carries the cache breakpoint.
    },
    {
      name: "ask_clarification",
      description:
        "Ask the user a single clarifying question INSTEAD of acting. Emit this ONLY when (a) capture-first would lose clearly-intended specific information AND (b) you cannot resolve a $project/#hashtag/date that has multiple plausible interpretations. NEVER emit ask_clarification in the same turn as any other tool_use block — it must be alone in the turn. Provide 2-5 short `options` chips when feasible. After your question, the user's next message will arrive prefixed `[CLARIFICATION REPLY]` — execute the action that time. Depth cap: only one ask_clarification per turn (server enforced).",
      input_schema: clarifySchema,
      strict: true,
      // Phase 5.1: ask_clarification is now the LAST tool — cache_control breakpoint here.
      cache_control: { type: "ephemeral" },
    },
  ];
}

// Re-export "For" variants so consumers can instantiate the voice-aware
// schemas for server-side re-validation matching the dispatched tool defs.
export { zCreateCaptureFor, zCreateEventFor, zCreateTaskFor, zRememberFactFor };

// Sanity touch: ensure the default `z*` exports remain wired through.
void zCreateTask;
void zCreateCapture;
void zCreateEvent;
void zRememberFact;
void zAskClarification;
