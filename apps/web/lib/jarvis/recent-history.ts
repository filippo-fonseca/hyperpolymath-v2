/**
 * recent-history.ts — server-side conversation memory for the JARVIS voice agent.
 *
 * The desktop / hardware voice path (`/api/jarvis/voice/transcript`) fires each
 * turn cold: it calls `runJarvisTurnStream` with no `messages`, so the model
 * only ever sees the single current utterance. That means pronoun / entity
 * references across turns fall apart — e.g.
 *
 *   User: "Can you text Rohan?"      → JARVIS: "...shall I send it?"
 *   User: "No, send him a message."  → JARVIS: "who is 'him', sir?"   ← forgot Rohan.
 *
 * `jarvis_turns` already persists every user + assistant turn for the console's
 * scrollback (see schema.ts). We reuse it here as the conversation source: load
 * the most recent turns, map them into Anthropic message shape, and thread them
 * in front of the current user turn so references resolve.
 *
 * There is NO session_id column, so "the current conversation" is approximated
 * by a recency window: turns within the last HISTORY_WINDOW_MS are treated as
 * the live thread. Turns from hours ago are dropped so a stale exchange never
 * bleeds into a fresh conversation. HISTORY_MAX_TURNS caps context/token cost.
 *
 * This is DISPLAY-derived context, not the agentic tool_use/tool_result loop —
 * we only carry the plain user text and assistant prose, which is exactly what
 * pronoun/entity resolution needs. (The in-turn agentic loop still lives in
 * run-turn.ts and rebuilds tool_result blocks per pass.)
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";

/**
 * How far back a turn can be and still count as "this conversation". No
 * session_id exists, so the time window is the pragmatic scope: 15 minutes is
 * long enough to span a natural back-and-forth (including a clarification and
 * the user's reply) but short enough that a fresh session an hour later starts
 * clean instead of inheriting stale references.
 */
export const HISTORY_WINDOW_MS = 15 * 60_000;

/**
 * Hard cap on how many prior turns we thread in. Keeps prompt size / token cost
 * bounded regardless of how chatty the recent window was.
 */
export const HISTORY_MAX_TURNS = 12;

/** Anthropic message shape (string content is all we need for plain history). */
export interface RecentHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Build the recent-conversation history for a user, oldest-first, ready to
 * prepend to the current user turn.
 *
 * - Only turns created within the last HISTORY_WINDOW_MS are considered.
 * - At most HISTORY_MAX_TURNS most-recent turns (then re-sorted oldest-first).
 * - `user` turns map from `text`; `assistant` turns map from `text_delta`.
 * - Rows with empty content are dropped (an empty message would be rejected by
 *   the Anthropic API and carries no context anyway).
 *
 * The caller appends the current user turn AFTER this array, so ending on an
 * assistant turn here is fine (roles need not strictly alternate for the API;
 * we only guarantee no empty messages).
 *
 * @param userId - the owner of the conversation.
 * @param now - injectable clock for deterministic tests; defaults to Date.now().
 */
export async function buildRecentHistory(
  userId: string,
  now: number = Date.now(),
): Promise<RecentHistoryMessage[]> {
  const cutoff = new Date(now - HISTORY_WINDOW_MS);

  // Most-recent-first so LIMIT keeps the freshest turns; we reverse below.
  const rows = await db
    .select({
      kind: jarvisTurns.kind,
      text: jarvisTurns.text,
      textDelta: jarvisTurns.textDelta,
      createdAt: jarvisTurns.createdAt,
    })
    .from(jarvisTurns)
    .where(and(eq(jarvisTurns.userId, userId), gte(jarvisTurns.createdAt, cutoff)))
    .orderBy(desc(jarvisTurns.createdAt))
    .limit(HISTORY_MAX_TURNS);

  // Reverse to oldest-first (chronological) for the message array.
  const chronological = [...rows].reverse();

  const messages: RecentHistoryMessage[] = [];
  for (const row of chronological) {
    const role: "user" | "assistant" = row.kind === "assistant" ? "assistant" : "user";
    const raw = role === "assistant" ? row.textDelta : row.text;
    const content = (raw ?? "").trim();
    if (!content) continue; // drop empties — API rejects them, no context lost.
    messages.push({ role, content });
  }

  return messages;
}
