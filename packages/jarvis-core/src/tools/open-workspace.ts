// Computer-control tool: open_workspace
//
// One block = one turn = one tool call carrying a whole list. The list-taking
// sibling of `open_app`/`open_url`, so a routine can pull up a whole
// workspace (apps + URLs) in parallel, each item optionally set to fullscreen.
//
// Server validates input and echoes a structured action for the desktop
// client to fan out. No side effects on the server side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const OpenWorkspaceItemSchema = z
  .object({
    type: z
      .enum(["url", "app"])
      .describe("'app' for a macOS application, 'url' for a website."),
    value: z
      .string()
      .min(1)
      .describe(
        "For app items: the macOS application name exactly as it appears in /Applications (e.g. 'Arc', 'WhatsApp', 'Warp', 'Spark'). For url items: the fully-qualified URL (e.g. 'https://mail.google.com').",
      ),
    label: z.string().optional(),
    fullscreen: z
      .boolean()
      .optional()
      .describe(
        "If true, the desktop client best-effort fullscreens this item after opening. A fullscreen failure never aborts the other opens.",
      ),
  })
  .strict();

export const OpenWorkspaceInputSchema = z
  .object({
    items: z.array(OpenWorkspaceItemSchema).min(1),
  })
  .strict();

export type OpenWorkspaceInput = z.infer<typeof OpenWorkspaceInputSchema>;

export const openWorkspaceTool = {
  name: "open_workspace" as const,
  description:
    "Open a configured set of macOS applications and URLs at once — a workspace launch. Each item has a `type` ('app' | 'url'), a `value` (app name or URL), an optional `label`, and an optional `fullscreen` boolean. Pass the `items` list through EXACTLY as provided in any `[ROUTINE BLOCK PARAMS …]` hint — do not add, drop, or reorder items. Always announce the action briefly before calling this tool (e.g. 'Pulling up your workspace, sir') and then emit the tool_use block.",
  input_schema: toJsonSchema(OpenWorkspaceInputSchema),
};
