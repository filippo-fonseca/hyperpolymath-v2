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
      .enum(["imessage"])
      .describe(
        "Messaging app to use. Only 'imessage' is supported for now (extensible later).",
      ),
    recipient: z
      .string()
      .min(1)
      .describe("Contact name, phone number, or Apple ID email of the recipient."),
    text: z.string().min(1).describe("The message text to send, verbatim."),
    label: z.string().optional(),
  })
  .strict();

export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const sendMessageTool = {
  name: "send_message" as const,
  description:
    "Send an iMessage to a contact via the Messages app on the user's Mac. DESTRUCTIVE — the message requires a spoken confirmation from the user before it sends: BEFORE calling this tool, speak a one-line readback naming the recipient and quoting the message, then the desktop client will hold the send until the user confirms aloud. Never call this tool silently.",
  input_schema: toJsonSchema(SendMessageInputSchema),
};
