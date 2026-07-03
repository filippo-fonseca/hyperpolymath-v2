// Computer-control tool: computer_use — the CATCH-ALL fallback.
//
// Server validates input and returns a structured action for the desktop
// client, which then drives a multi-step Anthropic Computer Use loop against
// /api/jarvis/computer-use/step (screenshot → model → mouse/keyboard →
// repeat). No side effects on the server side at dispatch time.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const ComputerUseInputSchema = z
  .object({
    task: z
      .string()
      .min(1)
      .describe(
        "Plain-language description of the desktop task to perform, e.g. 'close all open browser tabs'. One task per call.",
      ),
  })
  .strict();

export type ComputerUseInput = z.infer<typeof ComputerUseInputSchema>;

export const computerUseTool = {
  name: "computer_use" as const,
  description:
    "Catch-all: visually drive the user's Mac step by step (screenshots + mouse + keyboard) to complete a desktop task. Use ONLY when no other named tool can accomplish the request. NEVER for opening urls/apps, web/maps search, volume, music, calendar, messages, screenshots, typing, or keystrokes — those have dedicated tools. Ranks BELOW run_applescript and run_shortcut: reach for it only when even those cannot do the job.",
  input_schema: toJsonSchema(ComputerUseInputSchema),
};
