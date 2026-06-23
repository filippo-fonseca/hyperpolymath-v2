// Phase D: find_people tool.
//
// Fuzzy-finds people in the user's roster by name (and/or tag) so JARVIS can
// resolve an @-mention to an existing person before linking. Returns up to 10
// matches with their ids. A read/discovery tool, sibling to find_tasks.
//
// NON-STRICT tool (grammar budget). Server-side Zod validation in run-turn.ts
// enforces the contract before dispatch.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const FindPeopleInputSchema = z
  .object({
    query: z.string().optional(),
  })
  .strip();

export type FindPeopleInput = z.infer<typeof FindPeopleInputSchema>;

export const findPeopleTool = {
  name: "find_people" as const,
  description:
    "Search the user's people roster by name. Omit `query` to list everyone. Returns up to 10 matches, each with a real id you can pass to link_people. Use this BEFORE link_people when you are not sure whether a person already exists, so you reuse the existing record instead of creating a duplicate. `query` is free-text matched against names (case-insensitive substring).",
  input_schema: toJsonSchema(FindPeopleInputSchema),
};
