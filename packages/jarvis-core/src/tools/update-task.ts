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
    title: z.string().min(1).max(500).optional(),
    description: z.string().nullable().optional(),
    priority: z.enum(["P∞", "P1", "P2", "P3"]).optional(),
    status: z
      .enum(["not started", "up next", "in progress", "almost done", "lesno"])
      .optional(),
    due: z.string().nullable().optional(),
    project_ids: z.array(z.string()).optional(),
  })
  .strict();

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const updateTaskTool = {
  name: "update_task" as const,
  description:
    "Update an existing task by id. Only the fields provided are changed. The id MUST come from session entities or a find_tasks result — never invent. `priority` must be one of: P∞, P1, P2, P3. `status` must be one of: not started, up next, in progress, almost done, lesno. `due` is an ISO date string or null to clear. `project_ids` replaces the full list (provide up to 20 ids; server ignores any not owned by the user).",
  input_schema: toJsonSchema(UpdateTaskInputSchema),
};
