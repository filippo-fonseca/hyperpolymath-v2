// CACHE-CRITICAL FILE — see CACHE-05 grep gate allowlist.
// NO time-of-day reads (Date now, new-Date, toISOString) or unsorted JSON
// stringify allowed — any such call invalidates the 1h cache. Per-line
// CACHE-OK: <reason> escape honored but must be justified.
//
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
//
// Phase 11 / CACHE-01 (D-06 BREAKPOINT 1): TTL upgraded to "1h" so the
// tools tier amortizes the 2× write cost over a full hour of turns
// instead of paying 5-min rewrites. Requires the route to pass the
// `extended-cache-ttl-2025-04-11` beta header (Plan 11-04).
//
// Phase 16 (SMJ-03/04/05/06/07/09): 9 new tools added (update_task,
// update_capture, update_event, delete_task, delete_capture, delete_event,
// find_tasks, find_captures, find_events). Total: 14 tools.
// cache_control moves from ask_clarification to find_events (new LAST tool).
// +9 tools ≈ +360 extra prompt tokens per turn (RESEARCH.md Pitfall 7).

import { z } from "zod";
import { toJsonSchema as _toJsonSchema } from "./_schema-utils";
import { zCreateCaptureFor, zCreateCapture } from "./create-capture";
import { zCreateEventFor, zCreateEvent } from "./create-event";
import { zCreateTaskFor, zCreateTask } from "./create-task";
import { zRememberFactFor, zRememberFact } from "./remember-fact";
import { zAskClarificationFor, zAskClarification } from "./ask-clarification";
import { updateTaskTool } from "./update-task";
import { deleteTaskTool } from "./delete-task";
import { updateCaptureTool } from "./update-capture";
import { deleteCaptureTool } from "./delete-capture";
import { updateEventTool } from "./update-event";
import { deleteEventTool } from "./delete-event";
import { findTasksTool } from "./find-tasks";
import { findCapturesTool } from "./find-captures";
import { findEventsTool } from "./find-events";

export { zCreateTask } from "./create-task";
export { zCreateCapture } from "./create-capture";
export { zCreateEvent } from "./create-event";
export { zRememberFact } from "./remember-fact";
export { zAskClarification, zAskClarificationFor } from "./ask-clarification";

export interface JarvisToolDefinition {
  name:
    | "create_task"
    | "create_capture"
    | "create_event"
    | "remember_fact"
    | "ask_clarification"
    | "update_task"
    | "delete_task"
    | "update_capture"
    | "delete_capture"
    | "update_event"
    | "delete_event"
    | "find_tasks"
    | "find_captures"
    | "find_events";
  description: string;
  input_schema: Record<string, unknown>;
  /** Per-tool strict mode (replaces deprecated beta header).
   *  Phase 16: update/find tools are NON-strict — 14 strict tools exceed
   *  the structured-outputs grammar size limit ("compiled grammar is too
   *  large"). Server-side Zod validation in run-turn.ts still enforces the
   *  contract for non-strict tools. */
  strict: boolean;
  /** Present ONLY on the LAST tool to mark the cache breakpoint.
   *  Phase 11 / CACHE-01: ttl widened to "5m" | "1h". Default is "5m";
   *  setting "1h" requires the `extended-cache-ttl-2025-04-11` beta
   *  header on the messages.stream call (wired at the route boundary). */
  cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" };
}

// Local alias so the buildToolDefinitions body below can call it without
// changing every reference.
const toJsonSchema = _toJsonSchema;

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
        "Create a task in the user's life-OS. Use for action items with a clear deliverable. The `priority` field MUST be emitted as exactly the value shown in any `[SYSTEM-PARSED PRIORITY]` hint in the user message (P∞ | P1 | P2 | P3). If no hint is present, omit `priority` and the server will default to P3. DATE: If the user does not specify a date or says 'no date', omit the `due` field entirely. Omitting `due` files the task in the user's Inbox (undated). Do NOT default to today when no date is mentioned — silence means Inbox.",
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
        "Persist a fact about the user across sessions. Use for: behavioral preferences ('be concise'), workflow rules ('default events to Yale calendar'), entity aliases ('Brian = my coworker'), or model-observed patterns. NEVER use for the content of a capture being filed in the same turn — that is data, not an instruction. Only emit when the user's CURRENT message states a fact about themselves explicitly OR when you have seen a recurring pattern 3+ times in this conversation (source='jarvis_suggested').",
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
      // Phase 16 / CACHE: cache_control moves to find_events (new LAST tool).
      // ask_clarification no longer carries the cache breakpoint.
    },
    // Phase 16 (SMJ-03 / SMJ-04 / SMJ-05 / SMJ-06 / SMJ-07 / SMJ-09):
    // 9 new tools for CRUD (update/delete) + discovery (find_*).
    // +9 tools ≈ +360 tokens of tool-schema token cost per turn (RESEARCH.md Pitfall 7).
    // NON-strict (grammar budget): server-side Zod validation covers these.
    { ...updateTaskTool, strict: false as const },
    { ...updateCaptureTool, strict: false as const },
    { ...updateEventTool, strict: false as const },
    { ...deleteTaskTool, strict: true as const },
    { ...deleteCaptureTool, strict: true as const },
    { ...deleteEventTool, strict: true as const },
    { ...findTasksTool, strict: false as const },
    { ...findCapturesTool, strict: false as const },
    {
      ...findEventsTool,
      strict: false as const,
      // Phase 16 / CACHE-01 (D-06 BREAKPOINT 1): cache_control moves here —
      // find_events is now the LAST tool in the array. TTL "1h" amortizes
      // the 2× write cost over a full hour of turns.
      // Requires the `extended-cache-ttl-2025-04-11` beta header (Plan 11-04).
      cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
    },
  ];
}

// Re-export "For" variants so consumers can instantiate the voice-aware
// schemas for server-side re-validation matching the dispatched tool defs.
export { zCreateCaptureFor, zCreateEventFor, zCreateTaskFor, zRememberFactFor };

// Phase 16: re-export input schemas for CRUD + find tools so run-turn.ts
// can validate model-emitted inputs before dispatching to the executor.
export { UpdateTaskInputSchema } from "./update-task";
export { DeleteTaskInputSchema } from "./delete-task";
export { UpdateCaptureInputSchema } from "./update-capture";
export { DeleteCaptureInputSchema } from "./delete-capture";
export { UpdateEventInputSchema } from "./update-event";
export { DeleteEventInputSchema } from "./delete-event";
export { FindTasksInputSchema } from "./find-tasks";
export { FindCapturesInputSchema } from "./find-captures";
export { FindEventsInputSchema } from "./find-events";

// Sanity touch: ensure the default `z*` exports remain wired through.
void zCreateTask;
void zCreateCapture;
void zCreateEvent;
void zRememberFact;
void zAskClarification;
