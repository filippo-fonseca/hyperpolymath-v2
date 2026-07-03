// Server-side data tool: read_gmail
//
// Like get_weather, this tool runs FULLY server-side: the executor uses the
// existing Google OAuth client (calendar + drive scopes today; gmail.readonly
// added in the same slice) to read the OWNER'S Gmail inbox metadata + snippet
// and returns the results in the receipt for the agent to narrate aloud.
// No DesktopAction is emitted.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const ReadGmailInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Gmail search query using standard Gmail search syntax, e.g. 'is:unread', 'from:sam after:2026/07/01', 'label:starred newer_than:2d', 'subject:invoice'. Omit for the newest messages in the inbox.",
      ),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe(
        "How many messages to return. Defaults to 10; hard capped at 25 so the model doesn't drown in inbox chatter.",
      ),
  })
  .strict();

export type ReadGmailInput = z.infer<typeof ReadGmailInputSchema>;

export const readGmailTool = {
  name: "read_gmail" as const,
  description:
    "Read the user's Gmail inbox (metadata + snippet only — subject, from, date, and Gmail's own preview snippet — never the full body). Use for briefing/summarizing requests like 'brief me on my email', 'what's new in my inbox', 'any emails from Sam today?'. Accepts standard Gmail search syntax via `query` (e.g. 'is:unread', 'from:x@y.com after:2026/07/01'); omit to get the newest inbox items. Results are compact so you can narrate the top items aloud in one crisp butler paragraph — never read out full bodies or every message.",
  input_schema: toJsonSchema(ReadGmailInputSchema),
};
