// Search tool: web_search
//
// For ordinary web questions, the server can perform a low-latency search
// and return result snippets for the model to answer from. Maps queries still
// return a structured open_url action for the desktop client.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const WebSearchInputSchema = z
  .object({
    query: z.string().min(1),
    engine: z.enum(["google", "maps"]).optional().default("google"),
  })
  .strict();

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

export const webSearchTool = {
  name: "web_search" as const,
  description:
    "Search the web or Google Maps on the user's behalf. The `query` is the search terms. `engine` defaults to 'google'; use 'google' for quick current/web questions so the server can return search results for a spoken answer, and use 'maps' when the user asks to find a place, get directions, or look something up on a map. For 'maps', the desktop opens Google Maps. For 'google', answer directly from returned results when present; if the receipt contains an open_url action fallback, the desktop will open the Google results page.",
  input_schema: toJsonSchema(WebSearchInputSchema),
};
