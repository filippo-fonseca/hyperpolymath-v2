/**
 * extract-facts.ts — aggressive, cheap fact extraction after each JARVIS turn.
 *
 * After a turn completes, we run one HAIKU call over the last few messages to
 * pull out DURABLE facts worth remembering: relationships, contact-channel
 * preferences (e.g. "Rohan is reached on WhatsApp"), standing instructions,
 * recurring preferences. Each extracted fact is upserted into `jarvis_facts`
 * (the existing long-term memory table) with source "jarvis_suggested", using
 * the same UNIQUE(user_id, type, key) last-write-wins path the `remember_fact`
 * executor uses. Because `buildFactsBlock` injects jarvis_facts into the cached
 * system prompt, anything saved here is automatically pre-loaded into context
 * on the NEXT turn — no new table, no migration, no read plumbing.
 *
 * The key win over `remember_fact` (which only fires when the model explicitly
 * decides to save something) is that this captures facts LEARNED from the
 * exchange itself — including the answer to a clarification. If JARVIS asks
 * "which app should I use to reach Rohan?" and the user replies "WhatsApp",
 * that preference gets persisted even though the user never said "remember
 * that Rohan uses WhatsApp".
 *
 * Fire-and-forget from run-turn.ts (no await), and ENTIRELY fail-closed: any
 * error (Haiku, parse, or db) is swallowed with a console.warn. It must never
 * throw into the caller and never delay the SSE stream closing. Mirrors the
 * Haiku side-call shape in lib/captures/suggest-tags.ts (inferCaptureTags).
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { jarvisFacts } from "@/lib/db/schema";
import { HAIKU_MODEL, getAnthropicClient } from "@/lib/jarvis/anthropic-client";

const FACT_TYPES = ["preference", "rule", "entity", "workflow"] as const;

const extractedFactsSchema = z.object({
  facts: z
    .array(
      z.object({
        type: z.enum(FACT_TYPES),
        key: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .default([]),
});

const TOOL_NAME = "extract_facts";

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    facts: {
      type: "array",
      description:
        "Durable facts worth remembering about the user, learned from this exchange. Empty when nothing durable was said.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [...FACT_TYPES],
            description:
              "'entity' for a person/place/thing and its attributes; 'preference' for how the user likes things done; 'rule' for a standing instruction; 'workflow' for a recurring multi-step routine.",
          },
          key: {
            type: "string",
            description:
              "Short stable identifier for the fact, dot-scoped when about an entity (e.g. 'rohan.messaging_app', 'meetings.default_length'). Reuse the same key so later updates overwrite rather than duplicate.",
          },
          value: {
            type: "string",
            description: "The fact itself, in a short phrase (e.g. 'WhatsApp', '30 minutes').",
          },
        },
        required: ["type", "key", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["facts"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = [
  "You extract DURABLE facts from a short exchange between a user and their personal-assistant agent (JARVIS), to save into long-term memory.",
  "",
  "GOAL: save as much genuinely durable information as possible — facts that will still be true and useful on a future, unrelated day. Be aggressive about capturing:",
  "- relationships and who people are (e.g. 'Rohan is the user's brother')",
  "- contact-channel preferences (which app/number/email to reach a specific person on)",
  "- standing instructions and rules the user states",
  "- recurring preferences (default meeting length, preferred workout time, tone, etc.)",
  "",
  "IMPORTANT: capture preferences LEARNED from the exchange, not just verbatim statements. If the agent asked a clarifying question and the user answered, save the answer as a durable fact.",
  "",
  "DO NOT save: one-off task content, dates for a single event, transient chit-chat, or anything that is only true for this single request.",
  "",
  "Use a stable dot-scoped `key` per entity so a later update overwrites the same key instead of creating a duplicate (e.g. always 'rohan.messaging_app').",
  "",
  "EXAMPLES:",
  'Exchange: user "text Rohan" → agent "which app should I use to reach Rohan?" → user "WhatsApp". Save: [{"type":"entity","key":"rohan.messaging_app","value":"WhatsApp"}].',
  'Exchange: user "my brother Sam just moved to Boston". Save: [{"type":"entity","key":"sam.relationship","value":"brother"},{"type":"entity","key":"sam.location","value":"Boston"}].',
  'Exchange: user "always default my meetings to 30 minutes". Save: [{"type":"preference","key":"meetings.default_length","value":"30 minutes"}].',
  'Exchange: user "add milk to my shopping list" → agent "Added.". Save: [] (one-off task content, nothing durable).',
  "",
  "Always respond by calling the extract_facts tool exactly once. Return an empty facts array when nothing durable was said. Do not write prose.",
].join("\n");

/** One message worth of plain text, in the order the conversation happened. */
export interface ExtractFactsMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ExtractAndPersistFactsArgs {
  userId: string;
  /** The recent messages to mine (typically the last ~4 of the turn). */
  recentMessages: ExtractFactsMessage[];
  /** BYOK Anthropic key already resolved by the caller for this turn. */
  apiKey: string;
}

/**
 * Flatten a message's content (string OR content-block array) to plain text.
 * run-turn's loop messages can carry tool_use / tool_result blocks; we only
 * want human-readable prose for extraction, so non-text blocks are dropped.
 */
function messageToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      const t = (block as { text?: unknown }).text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.join(" ");
}

/**
 * Extract durable facts from the recent exchange and upsert them into
 * jarvis_facts. Fire-and-forget; NEVER throws (fail-closed on any error).
 */
export async function extractAndPersistFacts(args: ExtractAndPersistFactsArgs): Promise<void> {
  try {
    const { userId, apiKey } = args;
    if (!apiKey) return;

    // Normalize to plain-text messages; drop empties.
    const messages: ExtractFactsMessage[] = [];
    for (const m of args.recentMessages ?? []) {
      const text = messageToText(m.content).trim();
      if (!text) continue;
      messages.push({ role: m.role, content: text });
    }
    if (messages.length === 0) return;

    const transcript = messages
      .map((m) => `${m.role === "assistant" ? "JARVIS" : "USER"}: ${m.content}`)
      .join("\n");

    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: "Emit durable facts learned from this exchange. Always call this exactly once.",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: `Exchange:\n${transcript}` }],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return;

    const parsed = extractedFactsSchema.safeParse(toolUse.input);
    if (!parsed.success) return;

    for (const fact of parsed.data.facts) {
      const key = fact.key.trim();
      const value = fact.value.trim();
      if (!key || !value) continue;

      // Dedupe cheaply: skip the write when an identical value already exists
      // for this (user, type, key) so we don't churn updatedAt on every turn.
      try {
        const existing = await db
          .select({ value: jarvisFacts.value })
          .from(jarvisFacts)
          .where(
            and(
              eq(jarvisFacts.userId, userId),
              eq(jarvisFacts.type, fact.type),
              eq(jarvisFacts.key, key),
            ),
          )
          .limit(1);
        if (existing[0]?.value === value) continue;

        // Same upsert path as executor.rememberFact: UNIQUE(user_id,type,key)
        // last-write-wins. Source is "jarvis_suggested" (auto-learned).
        const now = new Date();
        await db
          .insert(jarvisFacts)
          .values({
            userId,
            type: fact.type,
            key,
            value,
            source: "jarvis_suggested",
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [jarvisFacts.userId, jarvisFacts.type, jarvisFacts.key],
            set: {
              value: sql`excluded.value`,
              source: sql`excluded.source`,
              updatedAt: now,
            },
          });
      } catch (dbErr) {
        console.warn("[extract-facts] failed to upsert one fact; skipping", dbErr);
      }
    }
  } catch (err) {
    console.warn("[extract-facts] extractAndPersistFacts failed; no facts saved", err);
  }
}
