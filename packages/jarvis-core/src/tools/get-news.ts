// Server-side data tool: get_news
//
// Like get_weather / read_gmail, this tool runs FULLY server-side: the
// executor calls the Guardian Open Platform Content API and returns the
// article results in the receipt for the agent to narrate aloud. No
// DesktopAction is emitted.
//
// BYOK: the Guardian API key is a per-user BYOK provider ("guardian") with
// an owner env fallback (GUARDIAN_API_KEY). Guardian's key is free (up to
// developer-tier limits) — the graceful "no key configured" path routes the
// user to open-platform.theguardian.com to grab one.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const GetNewsInputSchema = z
  .object({
    topic: z
      .string()
      .optional()
      .describe(
        "Free-text topic, search phrase, or section keyword to bias the results (e.g. 'technology', 'AI', 'world', 'climate', 'tennis'). Omit for the newest general news.",
      ),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(15)
      .optional()
      .describe(
        "How many articles to return. Defaults to 8; hard capped at 15 so the model can narrate a tight briefing without dumping the whole front page.",
      ),
  })
  .strict();

export type GetNewsInput = z.infer<typeof GetNewsInputSchema>;

export const getNewsTool = {
  name: "get_news" as const,
  description:
    "Fetch the latest news headlines from The Guardian. Use for on-demand news questions ('what's happening in the world?', 'any AI news today?') and for the daily news briefing routine. Returns compact article metadata (title, section, published time, short trail-text summary, url) that you can narrate aloud in one crisp butler paragraph — never dump the raw list. Omit `topic` for newest general news; pass a phrase or section keyword for focused results.",
  input_schema: toJsonSchema(GetNewsInputSchema),
};
