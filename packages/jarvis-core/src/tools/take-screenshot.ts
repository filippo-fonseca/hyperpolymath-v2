// Computer-control tool: take_screenshot
//
// Server validates input and returns a structured action for the desktop
// client to execute (screencapture; optionally POSTs the PNG back to
// /api/jarvis/screenshot/describe for a spoken one-line description).
// No side effects on the server side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const TakeScreenshotInputSchema = z
  .object({
    describe: z
      .boolean()
      .optional()
      .describe(
        "Whether to describe the captured screen aloud in one sentence. Defaults to true.",
      ),
  })
  .strict();

export type TakeScreenshotInput = z.infer<typeof TakeScreenshotInputSchema>;

export const takeScreenshotTool = {
  name: "take_screenshot" as const,
  description:
    "Capture the user's current screen. Use when the user asks what's on screen, to look at the current state, or to describe/read visible UI content. With describe=true (the default) a one-sentence spoken description of the screen plays back automatically — do not also narrate the contents yourself.",
  input_schema: toJsonSchema(TakeScreenshotInputSchema),
};
