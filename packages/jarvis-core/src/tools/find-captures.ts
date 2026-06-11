// Phase 16 (SMJ-09) — find_captures tool.
//
// Fuzzy-finds captures by content text, hashtag, project, or recency.
// Returns up to 10 matches with truncated previews and ids.
// Use BEFORE update_capture or delete_capture when the target isn't in session entities.
//
// STRICT-MODE RULES (Anthropic / Pitfall 6):
// - Schema ends in .strict()

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const FindCapturesInputSchema = z
  .object({
    query: z.string().nullable(),
    hashtag: z.string().nullable(),
    project_id: z.string().nullable(),
    since: z.string().nullable(),
  })
  .strict();

export type FindCapturesInput = z.infer<typeof FindCapturesInputSchema>;

export const findCapturesTool = {
  name: "find_captures" as const,
  description:
    "Fuzzy-find captures by content text, hashtag, project, or recency. Pass null for any filter you are not using. Returns up to 10 matches with truncated previews and ids. Use BEFORE update_capture or delete_capture when the target capture isn't already in session entities. `query` is a free-text search against capture content. `hashtag` filters to a specific tag (without the # prefix). `project_id` filters to captures linked to a specific project. `since` is an ISO 8601 datetime string — returns only captures created after this timestamp.",
  input_schema: toJsonSchema(FindCapturesInputSchema),
};
