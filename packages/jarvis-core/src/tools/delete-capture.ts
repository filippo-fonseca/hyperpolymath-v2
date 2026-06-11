// Phase 16 (SMJ-06) — delete_capture tool.
//
// Permanently deletes a capture by id. Hard delete, no undo.
// The id MUST come from session entities or a find_captures result — never invent.
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const DeleteCaptureInputSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export type DeleteCaptureInput = z.infer<typeof DeleteCaptureInputSchema>;

export const deleteCaptureTool = {
  name: "delete_capture" as const,
  description:
    "Permanently delete a capture by id. Hard delete, no undo. The id MUST come from session entities or a find_captures result — never invent. If the user's intent to delete vs update is ambiguous, prefer ask_clarification instead.",
  input_schema: toJsonSchema(DeleteCaptureInputSchema),
};
