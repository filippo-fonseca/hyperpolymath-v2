/**
 * Fire-and-forget telemetry writer for jarvis_events (RES-05).
 *
 * Phase 5 Plan 05-02 Task 2.
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

export interface JarvisEventInput {
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
}

export async function logJarvisEvent(input: JarvisEventInput): Promise<void> {
  try {
    await db.insert(jarvisEvents).values({
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
    });
  } catch (err) {
    // Telemetry must never break the user flow. Log and swallow.
    console.error("[jarvis] logJarvisEvent failed", err);
  }
}
