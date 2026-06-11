// Phase 16 (SMJ-09) — find_tasks tool.
//
// Fuzzy-finds tasks by title text and/or filters.
// Returns up to 10 matches with their ids.
// Use BEFORE update_task or delete_task when the target isn't in session entities.
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()
// - NO .max() on arrays — strict mode rejects JSON Schema maxItems.
//   The "10 results" limit is enforced server-side and described in the description text.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const FindTasksInputSchema = z
  .object({
    query: z.string().optional(),
    status: z
      .array(
        z.enum([
          "not started",
          "up next",
          "in progress",
          "almost done",
          "lesno",
        ]),
      )
      .optional(),
    priority: z.array(z.enum(["P∞", "P1", "P2", "P3"])).optional(),
    project_id: z.string().optional(),
  })
  .strict();

export type FindTasksInput = z.infer<typeof FindTasksInputSchema>;

export const findTasksTool = {
  name: "find_tasks" as const,
  description:
    "Fuzzy-find tasks by title text and/or filters. Returns up to 10 matches with their ids. Use BEFORE update_task or delete_task when the target task isn't already in session entities. `query` is a free-text search against task titles. `status` filters to one or more status values. `priority` filters to one or more priority values. `project_id` filters to tasks linked to a specific project.",
  input_schema: toJsonSchema(FindTasksInputSchema),
};
