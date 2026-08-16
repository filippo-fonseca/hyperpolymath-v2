// Issue #400 — log_study_review tool.
//
// Logs one retrieval session against a topic and advances its memory state.
// "just did 40 minutes of blank-page recall on Laplace transforms, felt shaky"
// is the shape this exists for.
//
// NON-STRICT (grammar budget), so server-side Zod in run-turn.ts is the gate.
//
// The model must NOT guess `grade`. It is the one field only the user can
// supply, and a fabricated one silently corrupts the schedule — the description
// tells the model to ask rather than assume.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const LogStudyReviewInputSchema = z
  .object({
    topic_id: z.uuid(),
    mode: z.enum([
      "blank_recall",
      "derivation",
      "problem_set",
      "past_paper",
      "teach_back",
      "skim",
    ]),
    grade: z.enum(["blanked", "shaky", "solid", "fluent"]),
    duration_min: z.number().int().min(0).max(1440).optional(),
    reached_criterion: z.boolean().optional(),
    gaps: z.string().max(4000).optional(),
  })
  .strict();

export type LogStudyReviewInput = z.infer<typeof LogStudyReviewInputSchema>;

export const logStudyReviewTool = {
  name: "log_study_review" as const,
  description:
    "Log a study session against a topic the user has already reviewed, and reschedule it. Use when the user reports having revised something (\"went over Bode plots for an hour, felt shaky\"). Call find_study_topics FIRST to resolve the topic_id unless it is already in session entities. `mode` is HOW they reviewed: blank_recall (recalled onto an empty page), derivation (derived it from scratch), problem_set (worked problems), past_paper (timed, exam conditions), teach_back (explained it aloud), skim (reread notes — passive, earns half credit). `grade` is HOW IT WENT: blanked (could not reproduce it), shaky (needed hints or notes), solid (recalled cold with some friction), fluent (fast and clean). NEVER guess `grade` — if the user did not say how it went, ask them; a wrong grade corrupts the review schedule. `reached_criterion` is true if they kept at it until they got one clean run. `gaps` records what they blanked on, in their words.",
  input_schema: toJsonSchema(LogStudyReviewInputSchema),
};
