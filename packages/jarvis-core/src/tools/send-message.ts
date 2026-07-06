// Computer-control tool: send_message
//
// Server validates input and returns a structured action for the desktop
// client to execute. No side effects on the server side. The desktop
// dispatcher REQUIRES a user confirmation before anything sends — iMessage
// has no draft verb (AppleScript `send` fires immediately), so the confirm
// gate lives BEFORE the AppleScript runs (research-messaging.md Option A).
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const SendMessageInputSchema = z
  .object({
    app: z
      .enum(["imessage", "whatsapp"])
      .describe(
        "Messaging app to use. 'imessage' routes through Messages.app on the Mac (AppleScript); 'whatsapp' routes through the local lharries/whatsapp-mcp bridge (HTTP → whatsmeow). Pick based on what the user asked for.",
      ),
    recipient: z
      .string()
      .min(1)
      .describe(
        "iMessage: contact name, phone number, or Apple ID email. WhatsApp: phone number in international format (e.g. '+14155551234') OR a chat JID ('...@s.whatsapp.net' / '...@g.us').",
      ),
    text: z.string().min(1).describe("The message text to send, verbatim."),
    label: z.string().optional(),
  })
  .strict();

export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const sendMessageTool = {
  name: "send_message" as const,
  description:
    "Send a message on the user's Mac via iMessage (Messages.app) or WhatsApp (local bridge). DESTRUCTIVE — the send requires a spoken confirmation from the user: BEFORE calling this tool, speak a one-line readback naming the app + recipient and quoting the message. The desktop client will hold the send until the user confirms aloud. Never call this tool silently. Pick `app: 'whatsapp'` only when the user asked for WhatsApp explicitly, or when the recipient is a WhatsApp-only contact; default to `imessage` otherwise.",
  input_schema: toJsonSchema(SendMessageInputSchema),
};
