// Computer-control tool: press_key
//
// Server validates input and returns a structured action for the desktop
// client to execute (a key press or shortcut in the active app). No side
// effects on the server side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const PressKeyInputSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .describe("The key to press, e.g. 'return', 'escape', 'tab', 'space', 'w', 'n'."),
    modifiers: z
      .array(z.string())
      .optional()
      .describe(
        "Modifier keys held during the press, e.g. ['cmd'], ['cmd','shift']. Valid: cmd, shift, option, control. Omit for a bare key press.",
      ),
  })
  .strict();

export type PressKeyInput = z.infer<typeof PressKeyInputSchema>;

export const pressKeyTool = {
  name: "press_key" as const,
  description:
    "Press a keyboard key or shortcut on the user's Mac, e.g. Return to submit, Escape to dismiss, or cmd+w to close a tab. Use for triggering shortcuts in the active application. For quitting apps or anything with unsaved-work blast radius, follow the DESTRUCTIVE-ACTION GUARDRAIL first.",
  input_schema: toJsonSchema(PressKeyInputSchema),
};
