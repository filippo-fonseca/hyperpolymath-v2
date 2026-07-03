// Computer-control tool: run_shortcut
//
// Server validates input and returns a structured action for the desktop
// client to execute (the macOS `shortcuts run` CLI). No side effects on
// the server side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const RunShortcutInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .describe("Exact name of the Shortcut as it appears in the Shortcuts app."),
    input: z
      .string()
      .optional()
      .describe("Optional text input passed to the Shortcut."),
  })
  .strict();

export type RunShortcutInput = z.infer<typeof RunShortcutInputSchema>;

export const runShortcutTool = {
  name: "run_shortcut" as const,
  description:
    "Run a macOS Shortcut (Shortcuts app) by exact name on the user's Mac, optionally passing a text input. Use ONLY when the user references a Shortcut they have set up and no named tool covers the request.",
  input_schema: toJsonSchema(RunShortcutInputSchema),
};
