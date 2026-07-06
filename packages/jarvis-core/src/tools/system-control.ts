// Computer-control tool: system_control
//
// Server validates input and returns a structured action for the desktop
// client to execute (volume / brightness / focus / sleep). No side effects
// on the server side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const SystemControlInputSchema = z
  .object({
    action: z
      .enum(["volume", "brightness", "focus", "sleep"])
      .describe(
        "System setting to control: 'volume' (set output volume), 'brightness' (set display brightness), 'focus' (toggle a Focus mode), 'sleep' (put the Mac to sleep).",
      ),
    value: z
      .union([z.number(), z.string()])
      .optional()
      .describe(
        "For volume/brightness: a number 0-100. For focus: the Focus-mode name (e.g. 'Do Not Disturb'); omit to turn Focus off. Omit entirely for sleep.",
      ),
    label: z.string().optional(),
  })
  .strict();

export type SystemControlInput = z.infer<typeof SystemControlInputSchema>;

export const systemControlTool = {
  name: "system_control" as const,
  description:
    "Control macOS system settings on the user's Mac: volume (0-100), display brightness (0-100), Focus mode (by name), or put the machine to sleep. Non-destructive; no confirmation required. Always announce the action first per the BUTLER ANNOUNCE-BEFORE-ACT rule.",
  input_schema: toJsonSchema(SystemControlInputSchema),
};
