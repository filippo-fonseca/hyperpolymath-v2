/**
 * extract-facts.ts — aggressive, cheap fact extraction AND reconciliation after
 * each JARVIS turn.
 *
 * After a turn completes, we run one HAIKU call over the last few messages to
 * pull out DURABLE facts worth remembering: relationships, contact-channel
 * preferences (e.g. "Rohan is reached on WhatsApp"), standing instructions,
 * recurring preferences. Each op is applied against `jarvis_facts` (the
 * existing long-term memory table): `upsert` writes with source
 * "jarvis_suggested" via the same UNIQUE(user_id, type, key) last-write-wins
 * path the `remember_fact` executor uses; `delete` removes a retracted fact.
 * Because `buildFactsBlock` injects jarvis_facts into the cached system prompt,
 * anything saved here is automatically pre-loaded into context on the NEXT turn
 * — no new table, no migration, no read plumbing.
 *
 * The key win over `remember_fact` (which only fires when the model explicitly
 * decides to save something) is that this captures facts LEARNED from the
 * exchange itself — including the answer to a clarification. If JARVIS asks
 * "which app should I use to reach Rohan?" and the user replies "WhatsApp",
 * that preference gets persisted even though the user never said "remember
 * that Rohan uses WhatsApp".
 *
 * RECONCILIATION: we feed the user's CURRENT MEMORY (all their existing facts)
 * into the Haiku prompt so it can (a) reuse the EXACT existing key when a new
 * statement UPDATES a fact — so the upsert overwrites the right row rather than
 * spawning a near-duplicate — and (b) emit a `delete` when a fact is retracted
 * or contradicted with no replacement. This closes the "contradiction" gap:
 * "actually message Rohan on iMessage" overwrites the WhatsApp value, and
 * "forget that I prefer morning workouts" deletes the preference.
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
import { getJarvisFactsForUser } from "@/lib/db/queries/jarvis-facts";
import { HAIKU_MODEL, getAnthropicClient } from "@/lib/jarvis/anthropic-client";

const FACT_TYPES = ["preference", "rule", "entity", "workflow"] as const;

/** Guard against a runaway Haiku response nuking or bloating memory. */
const MAX_OPERATIONS = 10;
/** Cap the CURRENT MEMORY rendering so the prompt stays cheap and bounded. */
const MAX_MEMORY_LINES = 60;
const MAX_MEMORY_VALUE_LEN = 200;

const reconcileMemorySchema = z.object({
  operations: z
    .array(
      z
        .object({
          op: z.enum(["upsert", "delete"]),
          type: z.enum(FACT_TYPES),
          key: z.string().min(1),
          value: z.string().optional(),
        })
        // value is REQUIRED (non-empty) for upsert; ignored for delete.
        .refine((o) => o.op !== "upsert" || (typeof o.value === "string" && o.value.trim().length > 0), {
          message: "upsert requires a non-empty value",
        }),
    )
    .default([]),
});

const TOOL_NAME = "reconcile_memory";

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    operations: {
      type: "array",
      description:
        "Memory operations reconciling this exchange against CURRENT MEMORY. Empty when nothing durable changed. `upsert` to add or overwrite a fact; `delete` to remove a retracted/contradicted one.",
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: ["upsert", "delete"],
            description:
              "'upsert' creates or OVERWRITES the fact at (type,key); 'delete' removes an existing fact that has been retracted or contradicted with no replacement.",
          },
          type: {
            type: "string",
            enum: [...FACT_TYPES],
            description:
              "'entity' for a person/place/thing and its attributes; 'preference' for how the user likes things done; 'rule' for a standing instruction; 'workflow' for a recurring multi-step routine.",
          },
          key: {
            type: "string",
            description:
              "Short stable identifier for the fact, dot-scoped when about an entity (e.g. 'rohan.messaging_app', 'meetings.default_length'). When UPDATING or DELETING a fact that appears in CURRENT MEMORY, use its EXACT existing key so the op targets the right row.",
          },
          value: {
            type: "string",
            description:
              "The fact itself, in a short phrase (e.g. 'WhatsApp', '30 minutes'). REQUIRED for op 'upsert'; omit for 'delete'.",
          },
        },
        required: ["op", "type", "key"],
        additionalProperties: false,
      },
    },
  },
  required: ["operations"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = [
  "You maintain the DURABLE long-term memory of a personal-assistant agent (JARVIS) by reconciling a short user↔JARVIS exchange against the user's CURRENT MEMORY.",
  "",
  "GOAL: save as much genuinely durable information as possible — facts that will still be true and useful on a future, unrelated day. Be aggressive about capturing:",
  "- relationships and who people are (e.g. 'Rohan is the user's brother')",
  "- contact-channel preferences (which app/number/email to reach a specific person on)",
  "- standing instructions and rules the user states",
  "- recurring preferences (default meeting length, preferred workout time, tone, etc.)",
  "",
  "IMPORTANT: capture preferences LEARNED from the exchange, not just verbatim statements. If the agent asked a clarifying question and the user answered, save the answer as a durable fact.",
  "",
  "RECONCILE against CURRENT MEMORY:",
  "- When the exchange UPDATES or CONTRADICTS a fact already in CURRENT MEMORY, emit an `upsert` on that fact's EXACT existing (type,key) with the NEW value. This overwrites the stale value in place — do NOT invent a new near-duplicate key.",
  "- When the user RETRACTS a fact that is in CURRENT MEMORY and gives no replacement, emit a `delete` on its EXACT (type,key).",
  "- Only `delete` facts that actually appear in CURRENT MEMORY. Never delete a key you have not seen there.",
  "- For genuinely new durable facts, emit an `upsert` with a stable dot-scoped key.",
  "",
  "DO NOT save: one-off task content, dates for a single event, transient chit-chat, or anything that is only true for this single request.",
  "",
  "Use a stable dot-scoped `key` per entity so a later update overwrites the same key instead of creating a duplicate (e.g. always 'rohan.messaging_app').",
  "",
  "EXAMPLES:",
  'Exchange: user "text Rohan" → JARVIS "which app should I use to reach Rohan?" → user "WhatsApp". CURRENT MEMORY: (none). Ops: [{"op":"upsert","type":"entity","key":"rohan.messaging_app","value":"WhatsApp"}].',
  'Exchange: user "actually message Rohan on iMessage from now on". CURRENT MEMORY: entity/rohan.messaging_app = WhatsApp. This CONTRADICTS the stored value, so overwrite the same key. Ops: [{"op":"upsert","type":"entity","key":"rohan.messaging_app","value":"iMessage"}].',
  'Exchange: user "forget that I prefer morning workouts". CURRENT MEMORY: preference/workout_time = morning. Retraction with no replacement, so delete it. Ops: [{"op":"delete","type":"preference","key":"workout_time"}].',
  'Exchange: user "my brother Sam just moved to Boston". CURRENT MEMORY: (none). Ops: [{"op":"upsert","type":"entity","key":"sam.relationship","value":"brother"},{"op":"upsert","type":"entity","key":"sam.location","value":"Boston"}].',
  'Exchange: user "add milk to my shopping list" → JARVIS "Added.". Ops: [] (one-off task content, nothing durable).',
  "",
  "Always respond by calling the reconcile_memory tool exactly once. Return an empty operations array when nothing durable changed. Do not write prose.",
].join("\n");

/**
 * Render the user's current facts as compact `type/key = value` lines, capped
 * in count and length so the prompt stays bounded and cheap. This is the
 * CURRENT MEMORY the model reconciles against.
 */
function renderCurrentMemory(
  facts: Array<{ type: string; key: string; value: string }>,
): string {
  if (facts.length === 0) return "(none)";
  const lines: string[] = [];
  for (const f of facts.slice(0, MAX_MEMORY_LINES)) {
    let value = f.value ?? "";
    if (value.length > MAX_MEMORY_VALUE_LEN) value = `${value.slice(0, MAX_MEMORY_VALUE_LEN)}…`;
    lines.push(`${f.type}/${f.key} = ${value}`);
  }
  return lines.join("\n");
}

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
 * Extract durable facts from the recent exchange and reconcile them against the
 * user's existing memory: upsert new/updated facts and delete retracted ones.
 * Fire-and-forget; NEVER throws (fail-closed on any error).
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

    // Load the user's CURRENT MEMORY so Haiku can reconcile against it — reuse
    // the exact key when updating, and only delete facts it can actually see.
    // Guard: treat any read failure as empty memory; never throw.
    let currentFacts: Array<{ type: string; key: string; value: string }> = [];
    const knownKeys = new Set<string>();
    try {
      const rows = await getJarvisFactsForUser(userId);
      currentFacts = rows.map((r) => ({ type: r.type, key: r.key, value: r.value }));
      for (const f of currentFacts) knownKeys.add(`${f.type} ${f.key}`);
    } catch (memErr) {
      console.warn("[extract-facts] failed to load current memory; treating as empty", memErr);
    }
    const currentMemory = renderCurrentMemory(currentFacts);

    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Reconcile this exchange against CURRENT MEMORY, emitting upsert/delete operations. Always call this exactly once.",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        { role: "user", content: `CURRENT MEMORY:\n${currentMemory}\n\nExchange:\n${transcript}` },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return;

    const parsed = reconcileMemorySchema.safeParse(toolUse.input);
    if (!parsed.success) return;

    // Cap the op count so a runaway response can't nuke or bloat memory.
    const operations = parsed.data.operations.slice(0, MAX_OPERATIONS);

    for (const op of operations) {
      const key = op.key.trim();
      if (!key) continue;

      if (op.op === "delete") {
        // Only delete facts we actually fed the model (present in CURRENT
        // MEMORY). The where-clause is also safe on its own, but this guards
        // against Haiku inventing deletes for keys it never saw.
        if (!knownKeys.has(`${op.type} ${key}`)) continue;
        try {
          await db
            .delete(jarvisFacts)
            .where(
              and(
                eq(jarvisFacts.userId, userId),
                eq(jarvisFacts.type, op.type),
                eq(jarvisFacts.key, key),
              ),
            );
        } catch (dbErr) {
          console.warn("[extract-facts] failed to delete one fact; skipping", dbErr);
        }
        continue;
      }

      // op === "upsert" — value is guaranteed non-empty by the schema refine.
      const value = (op.value ?? "").trim();
      if (!value) continue;

      // Dedupe cheaply: skip the write when an identical value already exists
      // for this (user, type, key) so we don't churn updatedAt on every turn.
      try {
        const existing = await db
          .select({ value: jarvisFacts.value })
          .from(jarvisFacts)
          .where(
            and(
              eq(jarvisFacts.userId, userId),
              eq(jarvisFacts.type, op.type),
              eq(jarvisFacts.key, key),
            ),
          )
          .limit(1);
        if (existing[0]?.value === value) continue;

        // Same upsert path as executor.rememberFact: UNIQUE(user_id,type,key)
        // last-write-wins. Source is "jarvis_suggested" (auto-learned). When
        // this key already exists (a contradiction/update), the conflict clause
        // OVERWRITES the stale value in place.
        const now = new Date();
        await db
          .insert(jarvisFacts)
          .values({
            userId,
            type: op.type,
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
