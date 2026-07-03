// Computer-control tool: web_search
//
// Server builds the search URL and returns a structured open_url action
// for the desktop client. No side effects on the server side.
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
    "Search the web or Google Maps on the user's behalf. The `query` is the search terms. `engine` defaults to 'google'; use 'maps' when the user asks to find a place, get directions, or look something up on a map. The server builds the URL; the desktop opens it. Always announce the action before calling this tool: emit a short butler text block first, then this tool_use block.",
  input_schema: toJsonSchema(WebSearchInputSchema),
};
