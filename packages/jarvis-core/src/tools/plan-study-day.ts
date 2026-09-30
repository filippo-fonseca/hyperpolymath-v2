// Issue #400 — plan_study_day tool.
//
// Puts topics on a DAY. There is deliberately no time field anywhere in this
// path: the user assigns topics to days and fits them into the real schedule
// himself, which is also why this never touches Google Calendar.
//
// NON-STRICT (grammar budget), so server-side Zod in run-turn.ts is the gate.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const PlanStudyDayInputSchema = z
  .object({
    topic_ids: z.array(z.uuid()),
    /** Local calendar day, YYYY-MM-DD. */
    plan_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    assessment_id: z.uuid().optional(),
  })
  .strict();

export type PlanStudyDayInput = z.infer<typeof PlanStudyDayInputSchema>;

export const planStudyDayTool = {
  name: "plan_study_day" as const,
  description:
    "Put one or more study topics on a given DAY in the review plan (\"put Bode plots and Nyquist on Thursday\"). Call find_study_topics first to resolve ids unless they are already in session entities. `plan_date` is a local calendar day as YYYY-MM-DD — resolve relative dates like \"Thursday\" or \"tomorrow\" against today's date from the user state block. This schedules a DAY, never a time: do NOT create a calendar event for study plans, and do not ask the user what time. Re-planning a topic onto a day it is already on is a no-op, not an error. `assessment_id` optionally records which exam or problem set the session is for; omit it and the nearest upcoming assessment covering the topic is used.",
  input_schema: toJsonSchema(PlanStudyDayInputSchema),
};
