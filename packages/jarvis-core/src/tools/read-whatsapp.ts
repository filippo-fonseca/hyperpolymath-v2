// Server-side data tool: read_whatsapp
//
// FULLY server-side (like get_weather): the executor queries the
// whatsapp_messages Postgres table and returns a compact, per-chat grouped
// receipt for the agent to narrate. No DesktopAction is emitted.
//
// Data freshness depends on the LOCAL sync worker (tools/whatsapp-sync)
// keeping the table in step with the local lharries/whatsapp-mcp bridge. If
// the table is empty (no worker running or nothing new yet), the executor
// returns a friendly receipt suggesting the user check the bridge + sync
// process — never a scary error.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const ReadWhatsappInputSchema = z
  .object({
    chat: z
      .string()
      .optional()
      .describe(
        "Optional chat/contact name filter (case-insensitive ILIKE). Matches chat_name OR sender_name — e.g. 'Alan' or 'family group'.",
      ),
    since_hours: z
      .number()
      .int()
      .positive()
      .max(168)
      .optional()
      .describe(
        "Time window: only messages from the last N hours. Default 24, cap 168 (one week).",
      ),
    maxResults: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .describe("Cap on messages returned across all chats. Default 30, cap 100."),
    unrepliedOnly: z
      .boolean()
      .optional()
      .describe(
        "When true, only include chats whose most recent message is NOT from the user — i.e. things the user has yet to reply to.",
      ),
  })
  .strict();

export type ReadWhatsappInput = z.infer<typeof ReadWhatsappInputSchema>;

export const readWhatsappTool = {
  name: "read_whatsapp" as const,
  description:
    "Read the OWNER's recent WhatsApp messages (synced from a local bridge into Postgres). Use for 'brief me on my WhatsApp', 'anyone message me?', 'what did Alan say last night?', and to surface unreplied chats. Data freshness depends on the local sync worker; if the table is empty, narrate the friendly setup hint from the receipt instead of guessing. Returns messages grouped by chat, newest first, capped by `maxResults`.",
  input_schema: toJsonSchema(ReadWhatsappInputSchema),
};
