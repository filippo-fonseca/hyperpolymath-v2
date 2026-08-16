// Issue #400 — find_study_topics tool.
//
// Resolves a topic id before log_study_review or plan_study_day, and answers
// "what should I review today?" on its own.
//
// NON-STRICT (grammar budget), so server-side Zod in run-turn.ts is the gate.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const FindStudyTopicsInputSchema = z
  .object({
    query: z.string().optional(),
    project_id: z.uuid().optional(),
    /** Only topics that have fallen below their target retention. */
    due_only: z.boolean().optional(),
  })
  .strict();

export type FindStudyTopicsInput = z.infer<typeof FindStudyTopicsInputSchema>;

export const findStudyTopicsTool = {
  name: "find_study_topics" as const,
  description:
    "Find study topics by title text, class, or how faded they are. Returns up to 20 matches with their ids, current retention, weight, and next assessment. Use BEFORE log_study_review or plan_study_day when the topic is not already in session entities. Also the right tool for \"what should I review today?\" or \"what am I forgetting in Signals?\" — set `due_only` true to get only topics that have decayed below their target, ranked most urgent first. `project_id` narrows to one class.",
  input_schema: toJsonSchema(FindStudyTopicsInputSchema),
};
