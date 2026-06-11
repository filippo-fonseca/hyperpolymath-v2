// Phase 16 (SMJ-09) — find_events tool.
//
// Searches Google Calendar events by free text and/or time window.
// Returns up to 10 events with their calendar_id + id pairs.
// Use BEFORE update_event or delete_event when the target isn't in session entities.
//
// MVP scope: searches the user's default calendar only (RESEARCH.md Open Question 3).
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const FindEventsInputSchema = z
  .object({
    query: z.string().optional(),
    time_min: z.string().optional(),
    time_max: z.string().optional(),
  })
  .strict();

export type FindEventsInput = z.infer<typeof FindEventsInputSchema>;

export const findEventsTool = {
  name: "find_events" as const,
  description:
    "Search Google Calendar events by free text and/or time window. Returns up to 10 events with their calendar_id + id pairs. Use BEFORE update_event or delete_event when the target event isn't already in session entities. `query` is a free-text search against event titles and descriptions. `time_min` and `time_max` are ISO 8601 datetime strings defining the search window. MVP scope: searches the default calendar only.",
  input_schema: toJsonSchema(FindEventsInputSchema),
};
