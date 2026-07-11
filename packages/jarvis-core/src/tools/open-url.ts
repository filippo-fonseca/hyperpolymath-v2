// Computer-control tool: open_url
//
// Server validates input and returns a structured action for the desktop
// client to execute. No side effects on the server side — the executor
// is a pure action-builder.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const OpenUrlInputSchema = z
  .object({
    url: z
      .string()
      .min(1)
      .refine((v) => v.startsWith("http://") || v.startsWith("https://"), {
        message: "url must start with http:// or https://",
      }),
    label: z.string().optional(),
  })
  .strict();

export type OpenUrlInput = z.infer<typeof OpenUrlInputSchema>;

export const openUrlTool = {
  name: "open_url" as const,
  description:
    "Open a URL in the user's external default browser via the desktop client. Use when they explicitly want the external browser or when no Studio canvas is implied. When they say 'pull up a website', 'show it on screen', or ask for an in-Studio widget, prefer studio_open_widget instead. The `label` field is an optional human-readable name. Always announce the action before calling this tool.",
  input_schema: toJsonSchema(OpenUrlInputSchema),
};
