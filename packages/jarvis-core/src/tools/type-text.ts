// Computer-control tool: type_text
//
// Server validates input and returns a structured action for the desktop
// client to execute (keystrokes into the focused field). No side effects
// on the server side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const TypeTextInputSchema = z
  .object({
    text: z
      .string()
      .min(1)
      .describe("Text to type into the currently focused field, as if typed on the keyboard."),
  })
  .strict();

export type TypeTextInput = z.infer<typeof TypeTextInputSchema>;

export const typeTextTool = {
  name: "type_text" as const,
  description:
    "Type text into the currently focused text field on the user's Mac, as if the user typed on the keyboard. Use for filling a field or composing in the active app when a window is already open and focused. Does NOT press Enter — pair with press_key if submission is needed.",
  input_schema: toJsonSchema(TypeTextInputSchema),
};
