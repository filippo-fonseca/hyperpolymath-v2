// Computer-control tool: run_applescript
//
// Server validates input and returns a structured action for the desktop
// client to execute via osascript. No side effects on the server side.
// This is the CATCH-ALL for macOS automation — named tools always win.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const RunApplescriptInputSchema = z
  .object({
    label: z
      .string()
      .min(1)
      .describe(
        "Short human-readable description of what the script does, e.g. 'empty the Trash'. Required — shown/spoken to the user.",
      ),
    script: z.string().min(1).describe("The AppleScript source to execute via osascript."),
  })
  .strict();

export type RunApplescriptInput = z.infer<typeof RunApplescriptInputSchema>;

export const runApplescriptTool = {
  name: "run_applescript" as const,
  description:
    "Run an AppleScript on the user's Mac. CATCH-ALL for macOS automation ONLY when no named tool fits (open_url, open_app, web_search, play_music, system_control, send_message, type_text, press_key, take_screenshot, run_shortcut). Always provide a short human-readable `label` describing what the script does. Never use this for messaging — send_message owns that path with its confirm gate.",
  input_schema: toJsonSchema(RunApplescriptInputSchema),
};
