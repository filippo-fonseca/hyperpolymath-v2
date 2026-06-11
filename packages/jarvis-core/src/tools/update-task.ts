// Phase 16 (SMJ-03) — update_task tool.
//
// Updates an existing task by id. Only the fields provided are changed.
// The id MUST come from session entities or a find_tasks result — never invent.
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()
// - NO .max() on arrays — strict mode rejects JSON Schema maxItems.
//   The "reasonable limit" constraint is documented in the description text only.
// - NO uniqueItems.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const UpdateTaskInputSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(500).nullable(),
    description: z.string().nullable(),
    priority: z.enum(["P∞", "P1", "P2", "P3"]).nullable(),
    status: z
      .enum(["not started", "up next", "in progress", "almost done", "lesno"])
      .nullable(),
    due: z.string().nullable(),
  })
  .strict();

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const updateTaskTool = {
  name: "update_task" as const,
  description:
    "Update an existing task by id. Pass null for every field you are NOT changing — only non-null fields are applied. The id MUST come from session entities or a find_tasks result — never invent. `priority` must be one of: P∞, P1, P2, P3. `status` must be one of: not started, up next, in progress, almost done, lesno. `due` is an ISO date string; pass an empty string \"\" to clear the due date. `description`: pass \"\" to clear.",
  input_schema: toJsonSchema(UpdateTaskInputSchema),
};
