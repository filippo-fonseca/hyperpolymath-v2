// Phase 16 (SMJ-07) — delete_event tool.
//
// Permanently deletes a Google Calendar event.
// Both id and calendar_id are required — GCal needs both to address an event.
// The id MUST come from session entities or a find_events result — never invent.
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const DeleteEventInputSchema = z
  .object({
    id: z.string().min(1),
    calendar_id: z.string().min(1),
  })
  .strict();

export type DeleteEventInput = z.infer<typeof DeleteEventInputSchema>;

export const deleteEventTool = {
  name: "delete_event" as const,
  description:
    "Permanently delete a Google Calendar event by id within a calendar_id. Both id and calendar_id are required. Hard delete — the event is removed from Google Calendar, no undo. The id MUST come from session entities or a find_events result — never invent. If the user's intent to delete vs update is ambiguous, prefer ask_clarification instead.",
  input_schema: toJsonSchema(DeleteEventInputSchema),
};
