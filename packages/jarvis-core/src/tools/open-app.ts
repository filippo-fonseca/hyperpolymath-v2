// Computer-control tool: open_app
//
// Server validates input and returns a structured action for the desktop
// client to execute. No side effects on the server side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const OpenAppInputSchema = z
  .object({
    app: z
      .string()
      .min(1)
      .describe(
        "macOS application name exactly as it appears in /Applications, e.g. 'Safari', 'Spotify', 'Slack', 'Figma', 'VS Code'.",
      ),
    label: z.string().optional(),
  })
  .strict();

export type OpenAppInput = z.infer<typeof OpenAppInputSchema>;

export const openAppTool = {
  name: "open_app" as const,
  description:
    "Launch a macOS application via the desktop client. The `app` field is the application name as it appears in /Applications (e.g. 'Safari', 'Spotify', 'Slack', 'Figma'). The `label` field is an optional human-readable override for the spoken acknowledgement. Always announce the action before calling this tool: emit a short butler text block first, then this tool_use block.",
  input_schema: toJsonSchema(OpenAppInputSchema),
};
