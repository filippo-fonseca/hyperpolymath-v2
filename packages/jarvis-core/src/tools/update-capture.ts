// Phase 16 (SMJ-05) — update_capture tool.
//
// Updates an existing capture by id. Only the fields provided are changed.
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
    content: z.string().min(1).optional(),
    hashtags: z.array(z.string()).optional(),
    project_ids: z.array(z.string()).optional(),
  })
  .strict();

export type UpdateCaptureInput = z.infer<typeof UpdateCaptureInputSchema>;

export const updateCaptureTool = {
  name: "update_capture" as const,
  description:
    "Update an existing capture by id. Only the fields provided are changed. The id MUST come from session entities or a find_captures result — never invent. `hashtags` replaces the full list. `project_ids` replaces the full list (provide up to 20; server drops any not owned by the user).",
  input_schema: toJsonSchema(UpdateCaptureInputSchema),
};
