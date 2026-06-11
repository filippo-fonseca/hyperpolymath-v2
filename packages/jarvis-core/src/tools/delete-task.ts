// Phase 16 (SMJ-04) — delete_task tool.
//
// Permanently deletes a task by id. Hard delete, no undo.
// The id MUST come from session entities or a find_tasks result — never invent.
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const DeleteTaskInputSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export type DeleteTaskInput = z.infer<typeof DeleteTaskInputSchema>;

export const deleteTaskTool = {
  name: "delete_task" as const,
  description:
    "Permanently delete a task by id. Hard delete, no undo. The id MUST come from session entities or a find_tasks result — never invent. If the user's intent to delete vs update is ambiguous, prefer ask_clarification instead.",
  input_schema: toJsonSchema(DeleteTaskInputSchema),
};
