// Issue #400 — create_study_topics tool.
//
// Bulk-creates a topic tree under a class project from a pasted syllabus,
// lecture schedule or textbook contents. This is the tool that removes the real
// friction from the whole feature: typing forty topics by hand is how a study
// tracker dies in week one.
//
// NON-STRICT (grammar budget), so server-side Zod in run-turn.ts is the gate.
//
// `parent_index` points BACKWARD into the same array, which is what lets one
// call build a two-level tree without a round trip per node. The executor
// rejects a forward or self reference.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const CreateStudyTopicsInputSchema = z
  .object({
    project_id: z.uuid(),
    topics: z.array(
      z
        .object({
          title: z.string().min(1).max(200),
          weight: z
            .enum(["skim", "familiar", "working", "fluent", "core"])
            .optional(),
          parent_index: z.number().int().min(0).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type CreateStudyTopicsInput = z.infer<typeof CreateStudyTopicsInputSchema>;

export const createStudyTopicsTool = {
  name: "create_study_topics" as const,
  description:
    "Create study topics under a CLASS project (a project with is_class true), for spaced-repetition review tracking. Use when the user pastes a syllabus, lecture schedule, exam study guide or textbook contents and wants it tracked, or asks to add topics to a class. `project_id` MUST be the UUID of a class from the USER PROJECTS list — if no class matches, file a capture instead and preserve their text verbatim. Each topic needs a `title`; keep titles as the user wrote them rather than rephrasing. `weight` is how well they need to know it and defaults to 'working' — use 'core' only for things the user calls high-yield or critical, 'skim' for things they call peripheral. Set `parent_index` to the zero-based index of an EARLIER entry in the same `topics` array to nest a subtopic under a unit; omit it for a top-level topic. Never point `parent_index` at a later entry or at itself. Up to 300 topics per call.",
  input_schema: toJsonSchema(CreateStudyTopicsInputSchema),
};
