/**
 * suggest-tags.ts — AI-assisted tag suggestions for captures (#36 / #40).
 *
 * Given the draft capture text and the user's existing tag vocabulary, one
 * claude-sonnet-4-6 call proposes a short list of relevant tags. The model is
 * told to strongly prefer reusing existing tags (so we don't accumulate
 * near-duplicate hashtags) and to coin at most a couple of new ones only when
 * nothing in the vocabulary fits.
 *
 * Reuses the JARVIS Anthropic singleton + forced Strict Tool Use pattern from
 * lib/jarvis/issue-specer.ts: a single messages.create with a forced tool,
 * Zod-validated output, fail-closed (empty suggestion) on any error so a flaky
 * model call never blocks the composer.
 */

import { HAIKU_MODEL, JARVIS_MODEL, getAnthropicClient } from "@/lib/jarvis/anthropic-client";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { z } from "zod";

export interface SuggestedTag {
  /** Tag label without the leading `#`, in display casing. */
  name: string;
  /** True when this matches an existing tag in the user's vocabulary. */
  existing: boolean;
}

const suggestionSchema = z.object({
  tags: z
    .array(
      z.object({
        name: z.string(),
        existing: z.boolean(),
      })
    )
    .default([]),
});

const TOOL_NAME = "emit_tag_suggestions";

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    tags: {
      type: "array",
      description:
        "Suggested tags for this capture, most relevant first. Up to 5. Prefer reusing existing tags; coin at most 2 new ones only when nothing fits.",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Tag label WITHOUT a leading #. Single token, lowercase or camelCase; no spaces.",
          },
          existing: {
            type: "boolean",
            description:
              "true if this exactly matches one of the user's existing tags, false if it is newly coined.",
          },
        },
        required: ["name", "existing"],
        additionalProperties: false,
      },
    },
  },
  required: ["tags"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = [
  "You suggest organizational tags for a quick note (a 'capture') in a personal life-OS app.",
  "",
  "GOAL: return a short list of relevant tags so the user does not have to tag manually.",
  "",
  "RULES:",
  "1. STRONGLY prefer reusing tags from the user's existing vocabulary when one fits, even loosely. Do NOT invent a near-duplicate of an existing tag (for example, do not propose 'workout' when 'fitness' already exists and fits). Reusing keeps the vocabulary tight.",
  "2. Only coin a NEW tag when nothing in the existing vocabulary reasonably fits, and coin at most 2 new tags.",
  "3. Return at most 5 tags total, most relevant first. Fewer is better than padding with weak matches. If nothing is relevant, return an empty list.",
  "4. Each tag is a single token without a leading #, without spaces (use camelCase or a single lowercase word). Set existing=true only when the tag exactly matches one of the provided existing tags (case-insensitively).",
  "",
  "Always respond by calling the emit_tag_suggestions tool. Do not write prose.",
].join("\n");

/**
 * Suggest tags for one capture draft. Returns a deduped, validated list, or an
 * empty array on any error (fail-closed — the composer just shows nothing).
 *
 * @param userId - the requesting user (for BYOK key resolution).
 * @param content - the draft capture text.
 * @param existingTags - the user's existing tag display names (without `#`).
 */
export async function suggestCaptureTags(
  userId: string,
  content: string,
  existingTags: string[]
): Promise<SuggestedTag[]> {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // BYOK: tag suggestions are an optional enhancement. If the user has no
  // Anthropic key, degrade silently to no suggestions rather than erroring —
  // the composer just shows nothing.
  const apiKey = await getUserKeyOrNull(userId, "anthropic");
  if (!apiKey) return [];

  try {
    const client = getAnthropicClient(apiKey);
    const vocab =
      existingTags.length > 0 ? existingTags.map((t) => `#${t}`).join(", ") : "(none yet)";

    const response = await client.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: "Emit suggested tags for one capture. Always call this exactly once.",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Existing tags: ${vocab}\n\nCapture:\n${trimmed}`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return [];

    const parsed = suggestionSchema.safeParse(toolUse.input);
    if (!parsed.success) return [];

    // Normalize against the existing vocabulary so `existing` is authoritative
    // server-side (the model's flag is advisory). Dedupe case-insensitively and
    // strip any stray leading # / whitespace.
    const existingByLower = new Map(existingTags.map((t) => [t.toLowerCase(), t] as const));
    const seen = new Set<string>();
    const out: SuggestedTag[] = [];
    for (const tag of parsed.data.tags) {
      const clean = tag.name.replace(/^#/, "").trim();
      if (!clean || /\s/.test(clean)) continue;
      const lower = clean.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const match = existingByLower.get(lower);
      out.push({ name: match ?? clean, existing: match !== undefined });
      if (out.length >= 5) break;
    }
    return out;
  } catch (err) {
    console.error("[suggest-tags] suggestCaptureTags failed; returning none", err);
    return [];
  }
}

// Hard cap on auto-applied tags. The model is told to be conservative; this is
// the backstop so a misbehaving response can never spam a capture.
const AUTO_TAG_MAX = 3;

const AUTO_TAG_SYSTEM_PROMPT = [
  "You assign organizational hashtags to a quick note (a 'capture') in a personal life-OS app.",
  "These tags are applied AUTOMATICALLY in the background, so precision matters more than coverage.",
  "",
  "GOAL: return only the hashtags that are genuinely warranted for this specific note.",
  "",
  "RULES:",
  `1. Return AT MOST ${AUTO_TAG_MAX} tags. Returning ZERO is the correct answer when no tag is clearly warranted. Do NOT force or pad tags.`,
  "2. STRONGLY prefer reusing a tag from the user's existing vocabulary when one fits, even loosely. Do not coin a near-duplicate of an existing tag. Only coin a new tag when nothing existing reasonably fits and the note clearly belongs to a distinct theme.",
  "3. A tag must capture a durable topic, project, area, or category the user would actually filter by later, not an incidental word in the note.",
  "4. Each tag is a single token without a leading #, without spaces (camelCase or a single lowercase word). Set existing=true only when the tag exactly matches one of the provided existing tags (case-insensitively).",
  "",
  "Always respond by calling the emit_tag_suggestions tool. Do not write prose.",
].join("\n");

/**
 * Infer a MINIMAL set of genuinely-warranted tags for a capture, for background
 * auto-tagging. Runs on Haiku (cheap) and is deliberately conservative: zero
 * tags is a valid answer. Reuses the same tool-call + validation shape as
 * suggestCaptureTags, and is fail-closed (empty array on any error) so the
 * background job never throws into a request path.
 *
 * @param userId - the requesting user (for BYOK key resolution).
 * @param content - the capture text.
 * @param existingTags - the user's existing tag display names (without `#`).
 */
export async function inferCaptureTags(
  userId: string,
  content: string,
  existingTags: string[]
): Promise<SuggestedTag[]> {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const apiKey = await getUserKeyOrNull(userId, "anthropic");
  if (!apiKey) return [];

  try {
    const client = getAnthropicClient(apiKey);
    const vocab =
      existingTags.length > 0 ? existingTags.map((t) => `#${t}`).join(", ") : "(none yet)";

    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 256,
      system: AUTO_TAG_SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: "Emit the warranted tags for one capture. Always call this exactly once.",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Existing tags: ${vocab}\n\nCapture:\n${trimmed}`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return [];

    const parsed = suggestionSchema.safeParse(toolUse.input);
    if (!parsed.success) return [];

    const existingByLower = new Map(existingTags.map((t) => [t.toLowerCase(), t] as const));
    const seen = new Set<string>();
    const out: SuggestedTag[] = [];
    for (const tag of parsed.data.tags) {
      const clean = tag.name.replace(/^#/, "").trim();
      if (!clean || /\s/.test(clean)) continue;
      const lower = clean.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const match = existingByLower.get(lower);
      out.push({ name: match ?? clean, existing: match !== undefined });
      if (out.length >= AUTO_TAG_MAX) break;
    }
    return out;
  } catch (err) {
    console.error("[suggest-tags] inferCaptureTags failed; returning none", err);
    return [];
  }
}
