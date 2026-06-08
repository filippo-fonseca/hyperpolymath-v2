/**
 * POST /api/jarvis/warm — predictive cache warmer (Phase 11 / CACHE-04, D-03).
 *
 * Fires a 1-token no-op Anthropic call with the same tools + frozen-system
 * shape as the real /api/jarvis route. NO user-state snapshot — warming
 * tier 1 + tier 2 (the 1h TTL tiers) only. Body is empty; the user message
 * is the literal string "warm".
 *
 * Triggers: app open / JARVIS input focus / mic arm — all dispatched by the
 * JarvisWarmer client component. Server-side age-gate: skip if the cache
 * was warmed within the last 50 min (well inside the 1h TTL window).
 *
 * Net cost (single user): ~$0.01-0.03/day with 30s client debounce +
 * 50min server age-gate. Compare to a heartbeat warmer at ~$0.90/day.
 *
 * NOTE: This route does NOT log to jarvis_events (Phase 9 telemetry is for
 * real user turns only). Warming is observable via Anthropic-side metrics
 * and via the next real turn's `prompt_built_at - request_received_at`
 * delta (warmed: tier 1+2 read; cold: tier 1+2 write).
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { getJarvisFactsForUser } from "@/lib/db/queries/jarvis-facts";
import {
  getAnthropicClient,
  JARVIS_MODEL,
} from "@/lib/jarvis/anthropic-client";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  buildToolDefinitions,
  type ProjectSummary,
} from "@hyperpolymath/jarvis-core";
import {
  getLastWarmAt,
  setLastWarmAt,
} from "@/lib/jarvis/state-snapshot-cache";

export const runtime = "nodejs";

/**
 * D-03 age-gate threshold: 50 minutes (well inside the 1h TTL window).
 * Single source of truth — both the JarvisWarmer client-side 30s debounce
 * AND this server-side gate must agree on the 1h TTL budget.
 */
const AGE_GATE_MS = 50 * 60 * 1000;

export async function POST(_req: NextRequest) {
  // 1. Auth — same pattern as /api/jarvis (CLAUDE.md Critical Pattern 1).
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claimsResult.data.claims.sub;

  // 2. Age-gate per D-03 — skip if recently warmed. Defence-in-depth
  //    against a future change accidentally dropping the client-side
  //    30s debounce on JarvisWarmer.
  const lastWarmAt = getLastWarmAt(userId);
  const now = Date.now();
  if (lastWarmAt !== null && now - lastWarmAt < AGE_GATE_MS) {
    return new Response(null, { status: 204 });
  }

  // 3. Build tools + system identical to /api/jarvis. NO snapshot block
  //    appended — warming tier 1 + tier 2 (1h TTL) only. Skipping the
  //    snapshot is the whole point: the warmer is for the slow-changing
  //    tiers; the 5-min snapshot tier follows the user's real CRUD
  //    activity and naturally stays warm through normal use.
  const [userProjects, userRows, userFacts] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, icon: projects.icon })
      .from(projects)
      .where(eq(projects.userId, userId)),
    db
      .select({ timezone: users.timezone, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    getJarvisFactsForUser(userId),
  ]);
  const projectSummaries: ProjectSummary[] = userProjects.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
  }));
  const system = buildSystemPrompt({
    projects: projectSummaries,
    facts: userFacts as import("@hyperpolymath/jarvis-core").JarvisFact[],
    // Warm always non-voice. The voice variant is a sibling cache key the
    // user will hit on first real voice turn anyway. Keeping the warmer
    // non-voice avoids ambiguity about which variant the next turn uses.
    voiceActive: false,
    userDisplayName: userRows[0]?.displayName ?? null,
  });
  const tools = buildToolDefinitions({ voiceActive: false });

  // 4. Fire 1-token no-op. messages.create (not stream) — no streaming
  //    needed for a single-token call. tool_choice: "none" so the model
  //    doesn't try to emit a tool_use block (which would cost output
  //    tokens beyond max_tokens=1 and could fail the call).
  try {
    const anth = getAnthropicClient();
    const result = await anth.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 1,
      system: system as unknown as never,
      tools: tools as unknown as never,
      tool_choice: { type: "none" } as unknown as never,
      messages: [{ role: "user", content: "warm" } as unknown as never],
    });

    // Record warm timestamp AFTER the Anthropic call succeeded — failures
    // must leave lastWarmAt untouched so the next user gesture retries.
    setLastWarmAt(userId, now);

    const usage =
      (result as {
        usage?: {
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      }).usage ?? {};
    return Response.json({
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheCreate: usage.cache_creation_input_tokens ?? 0,
    });
  } catch (err) {
    console.error("[jarvis] warm endpoint failed", err);
    return new Response("Warm failed", { status: 500 });
  }
}
