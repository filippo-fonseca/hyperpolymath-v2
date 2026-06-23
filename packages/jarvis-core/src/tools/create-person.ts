// Phase D — create_person tool.
//
// Creates a person/contact in the user's roster so JARVIS can @-mention them
// and link them to entities. The user owns the row; ctx.userId (never a
// model-emitted id) scopes every write at the executor boundary.
//
// NON-STRICT tool (grammar budget). Server-side Zod validation in run-turn.ts
// enforces the contract before dispatch, mirroring the Phase 16 find/update tools.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

// Canonical tag palette. The model SHOULD pick from these when a relationship
// is clear; freeform tags are still accepted (this is guidance, not an enum, so
// the model is not forced to invent a relationship it cannot infer).
export const CANONICAL_PERSON_TAGS = [
  "friend",
  "investor",
  "teacher",
  "professor",
  "colleague",
  "mentor",
  "code",
] as const;

export const CreatePersonInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.string().optional(),
    phone: z.string().optional(),
    bio: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strip();

export type CreatePersonInput = z.infer<typeof CreatePersonInputSchema>;

export const createPersonTool = {
  name: "create_person" as const,
  description:
    "Add a new person or contact to the user's roster. Use when the user wants to remember someone new (a friend, colleague, professor, investor, mentor, etc.), or names a person who is clearly not already known. `name` is required. `email`, `phone`, and `bio` are optional details. `tags` describe the relationship; prefer these canonical values when one fits: friend, investor, teacher, professor, colleague, mentor, code. Do NOT use this to re-create someone who already exists; call find_people first when unsure.",
  input_schema: toJsonSchema(CreatePersonInputSchema),
};
