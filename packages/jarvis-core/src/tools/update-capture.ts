// Phase 16 (SMJ-05) — update_capture tool.
//
// Updates an existing capture by id. Pass null for every field you are NOT changing — only non-null fields are applied.
// The id MUST come from session entities or a find_captures result — never invent.
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()
// - NO .max() on arrays — strict mode rejects JSON Schema maxItems.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const UpdateCaptureInputSchema = z
  .object({
    id: z.string().min(1),
    content: z.string().min(1).nullable(),
    // Resurfacing (remind-me) date. ISO 8601 datetime WITH offset to set/change
    // (resolve NL like "next Tuesday" against CURRENT USER TIME), empty string
    // "" to clear, null to leave unchanged. Mirrors update_task's `due`.
    resurface_at: z.string().nullable(),
  })
  .strict();

export type UpdateCaptureInput = z.infer<typeof UpdateCaptureInputSchema>;

export const updateCaptureTool = {
  name: "update_capture" as const,
  description:
    "Update an existing capture by id. Pass null for every field you are NOT changing — only non-null fields are applied. The id MUST come from session entities or a find_captures result — never invent. `resurface_at` sets a remind-me date (ISO datetime with offset); pass an empty string \"\" to clear it, or null to leave it unchanged.",
  input_schema: toJsonSchema(UpdateCaptureInputSchema),
};
