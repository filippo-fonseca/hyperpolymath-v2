/**
 * Fire-and-forget telemetry writer for jarvis_events (RES-05).
 *
 * Phase 5 Plan 05-02 Task 2.
 * Phase 9 Plan 09-01 Task 1: extended with optional per-stage timestamp
 * block (`stages`) and optional `id` (so /api/jarvis can pass a known
 * turnId — needed by Plan 09-02's beacon endpoint to UPDATE-by-id).
 *
 * Called from the SSE Route Handler AFTER `await stream.finalMessage()`
 * resolves (or once on error). The caller MUST `void`-await — telemetry
 * failures cannot break the user flow. We swallow + console.error any
 * insert exception. Phase 6's /insights surface (RES-06) reads these rows.
 *
 * RLS allows the authenticated session to INSERT rows where
 * user_id = auth.uid(). At the API route we operate as the user's session
 * (via @supabase/ssr cookies), so the policy admits the write.
 */

import { db } from "@/lib/db";
import { jarvisEvents } from "@/lib/db/schema";

/**
 * Phase 9 / TEL-01 — per-stage timestamps captured at each natural source.
 *
 *   - LLM-stage columns (always populated on a successful turn):
 *     promptBuiltAt, firstTokenAt, lastTokenAt, toolLoopDoneAt
 *   - Voice-pipeline columns (populated only when voiceActive=true):
 *     vadEndAt, sttDoneAt, ttsFirstByteAt, audioFirstPlayAt
 *
 * Omit fields when not applicable; the writer maps absent fields to
 * `null`. Voice-only fields landed via Plan 09-02's beacon endpoint
 * UPDATE the row by `id` post-hoc.
 */
export interface JarvisStageTimestamps {
  vadEndAt?: Date | null;
  sttDoneAt?: Date | null;
  promptBuiltAt?: Date | null;
  firstTokenAt?: Date | null;
  lastTokenAt?: Date | null;
  toolLoopDoneAt?: Date | null;
  ttsFirstByteAt?: Date | null;
  audioFirstPlayAt?: Date | null;
}

export interface JarvisEventInput {
  /**
   * Optional pre-known row id. When provided, the insert uses this UUID
   * instead of the table's `defaultRandom()`. Phase 9 / TEL-01 uses this
   * so /api/jarvis can emit `turnId` to the client at stream start and
   * the Plan 09-02 voice-stages beacon can `UPDATE WHERE id = $turnId`.
   * Omit to keep the original Phase 5 behavior (DB-assigned random uuid).
   */
  id?: string;
  userId: string;
  promptText: string;
  preParsedDates?: unknown;
  slashCommandMode?: string | null;
  voiceActive: boolean;
  actionTypes?: string[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  latencyMs: number;
  firstTokenMs?: number;
  error?: string;
  /**
   * Phase 9 / TEL-01 — per-stage timestamps. Omit when not applicable;
   * each field maps to a nullable timestamptz column. Optional outer
   * key preserves Phase 5 callers that don't pass stages at all.
   */
  stages?: JarvisStageTimestamps;
}

// Routine turnIds are composite strings like `${runId}:brief`, `${runId}:opener`,
// `${blockId}:filler` — not valid uuids. Passing them into the uuid `id` column
// throws `invalid input syntax for type uuid` at insert time. Guard so only a
// canonical uuid pins the row id; composite ids fall back to defaultRandom().
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function logJarvisEvent(input: JarvisEventInput): Promise<void> {
  try {
    await db.insert(jarvisEvents).values({
      // Only pin when id is a canonical uuid — composite routine turnIds
      // (e.g. `${runId}:brief`) would otherwise blow up the uuid column.
      ...(input.id && UUID_RE.test(input.id) ? { id: input.id } : {}),
      userId: input.userId,
      promptText: input.promptText,
      preParsedDates: input.preParsedDates as unknown,
      slashCommandMode: input.slashCommandMode ?? null,
      voiceActive: input.voiceActive,
      actionTypes: input.actionTypes ?? null,
      cacheReadInputTokens: input.usage?.cache_read_input_tokens ?? null,
      cacheCreationInputTokens: input.usage?.cache_creation_input_tokens ?? null,
      inputTokens: input.usage?.input_tokens ?? null,
      outputTokens: input.usage?.output_tokens ?? null,
      latencyMs: input.latencyMs,
      firstTokenMs: input.firstTokenMs ?? null,
      error: input.error ?? null,
      // Phase 9 / TEL-01 — stage timestamps. Defaulted to null when absent.
      vadEndAt: input.stages?.vadEndAt ?? null,
      sttDoneAt: input.stages?.sttDoneAt ?? null,
      promptBuiltAt: input.stages?.promptBuiltAt ?? null,
      firstTokenAt: input.stages?.firstTokenAt ?? null,
      lastTokenAt: input.stages?.lastTokenAt ?? null,
      toolLoopDoneAt: input.stages?.toolLoopDoneAt ?? null,
      ttsFirstByteAt: input.stages?.ttsFirstByteAt ?? null,
      audioFirstPlayAt: input.stages?.audioFirstPlayAt ?? null,
    });
  } catch (err) {
    // Telemetry must never break the user flow. Log and swallow.
    console.error("[jarvis] logJarvisEvent failed", err);
  }
}
