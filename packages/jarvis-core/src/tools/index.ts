// JARVIS Anthropic tool definitions (D-08 / D-09 / research §1.3).
//
// Strict tool use is per-tool now (`strict: true`); the previous
// structured-outputs beta header is deprecated (see research §1.5).
//
// Prompt caching: `cache_control: { type: "ephemeral" }` on the LAST tool
// caches the entire tools array (Anthropic caches everything before the
// breakpoint within each section).

import { z } from "zod";
import { zCreateCaptureFor, zCreateCapture } from "./create-capture";
import { zCreateEventFor, zCreateEvent } from "./create-event";
import { zCreateTaskFor, zCreateTask } from "./create-task";

export { zCreateTask } from "./create-task";
export { zCreateCapture } from "./create-capture";
export { zCreateEvent } from "./create-event";

export interface JarvisToolDefinition {
  name: "create_task" | "create_capture" | "create_event";
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
        "Create a freeform note. Default fallback when the input is ambiguous, exploratory, or doesn't cleanly fit a task or an event.",
      input_schema: captureSchema,
      strict: true,
    },
    {
      name: "create_event",
      description:
        "Create a Google Calendar event. Use for time-bound items with a start and end. calendar_id defaults to the user's primary calendar if omitted.",
      input_schema: eventSchema,
      strict: true,
      cache_control: { type: "ephemeral" },
    },
  ];
}

// Re-export "For" variants so consumers can instantiate the voice-aware
// schemas for server-side re-validation matching the dispatched tool defs.
export { zCreateCaptureFor, zCreateEventFor, zCreateTaskFor };

// Sanity touch: ensure the default `z*` exports remain wired through.
void zCreateTask;
void zCreateCapture;
void zCreateEvent;
