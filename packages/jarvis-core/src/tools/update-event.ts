// Phase 16 (SMJ-07) — update_event tool.
//
// Updates a Google Calendar event by id within a calendar_id.
// Both id and calendar_id are required — GCal needs both to address an event.
// The id MUST come from session entities or a find_events result — never invent.
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const UpdateEventInputSchema = z
  .object({
    id: z.string().min(1),
    calendar_id: z.string().min(1),
    title: z.string().min(1).max(500).optional(),
    description: z.string().nullable().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  })
  .strict();

export type UpdateEventInput = z.infer<typeof UpdateEventInputSchema>;

export const updateEventTool = {
  name: "update_event" as const,
  description:
    "Update a Google Calendar event by id within a calendar_id. Both id and calendar_id are required (GCal events are identified by the pair). Only the fields provided are changed. `start` and `end` are ISO 8601 datetime strings with UTC offset (e.g. 2026-06-11T20:00:00-04:00). The id MUST come from session entities or a find_events result — never invent.",
  input_schema: toJsonSchema(UpdateEventInputSchema),
};
