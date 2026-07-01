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
    "Open a URL in the user's default browser via the desktop client. Use for any http:// or https:// link the user wants to visit. The `label` field is an optional human-readable name for the URL (e.g. 'Google Maps', 'the article'). Always announce the action before calling this tool: emit a short butler text block first, then this tool_use block.",
  input_schema: toJsonSchema(OpenUrlInputSchema),
};
