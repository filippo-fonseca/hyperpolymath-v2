// Phase D: link_people tool.
//
// Links one or more people (resolve-or-create by name) to an entity the agent
// is working with this turn. The entity is identified by (from_type, from_id);
// from_id comes from a prior tool result IN THE SAME TURN (e.g. the id returned
// by create_task / create_capture / create_event) surfaced via SESSION ENTITIES,
// or from a find_* result. The model must NOT invent from_id.
//
// SEMANTICS: link_people ADDS links. It never removes a person's other links to
// the same entity. The executor merges the resolved ids with any references that
// already exist for (from_type, from_id) before reconciling, so calling it twice
// is additive and idempotent.
//
// NON-STRICT tool (grammar budget). Server-side Zod validation in run-turn.ts
// enforces the contract before dispatch.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

// Mirrors people_references.from_type (apps/web/app/actions/people.ts FROM_TYPES).
export const LINK_PEOPLE_FROM_TYPES = [
  "task",
  "capture",
  "page",
  "jarvis_fact",
  "event",
] as const;

export const LinkPeopleInputSchema = z
  .object({
    person_names: z.array(z.string().min(1)).min(1),
    from_type: z.enum(LINK_PEOPLE_FROM_TYPES),
    from_id: z.string().min(1),
  })
  .strip();

export type LinkPeopleInput = z.infer<typeof LinkPeopleInputSchema>;

export const linkPeopleTool = {
  name: "link_people" as const,
  description:
    "Link people to an entity you are creating or touching this turn. `person_names` is a list of names; each is resolved to an existing person (case-insensitive) or created if new, so you can mention known and brand-new people together. `from_type` is the kind of entity: task, capture, page, jarvis_fact, or event. `from_id` is that entity's real id, taken from a prior tool result in THIS turn (e.g. the id create_task returned) via SESSION ENTITIES, or from a find_* result. NEVER invent `from_id`. Linking is additive: it adds these people without removing others already linked.",
  input_schema: toJsonSchema(LinkPeopleInputSchema),
};
