import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import {
  buildSystemPrompt,
  buildToolDefinitions,
  type ProjectSummary,
} from "@hyperpolymath/jarvis-core";
import type { JarvisFact } from "@hyperpolymath/jarvis-core";
import {
  getAnthropicClient,
  JARVIS_MODEL,
} from "@/lib/jarvis/anthropic-client";
import { getJarvisFactsForUser } from "@/lib/db/queries/jarvis-facts";
import { findSingleUserId } from "@/lib/jarvis/find-single-user";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Trigger-Secret, X-Jarvis-Mode",
};

/**
 * POST /api/jarvis/voice/warmup
 *
 * Side-effect-free cache pre-warm. The FIRST real voice turn of a session pays
 * ~45s to CREATE the Anthropic 1h prompt cache (the ~15-17K-token system+tools
 * stable prefix); every subsequent turn READS it in ~600ms. This route fires
 * that expensive creation AHEAD of the user's first spoken command — at desktop
 * boot and on every wake — so turn 1 already reads a warm cache.
 *
 * It reproduces the EXACT cacheable prefix the real turn builds (same system
 * blocks up to the 1h cache_control breakpoint on the project-list block, same
 * tool definitions with their own breakpoint), then issues ONE minimal
 * Anthropic messages call (max_tokens 1, trivial user message, no tools forced,
 * no streaming) purely to create/read that cache. It also does the same
 * user + facts DB reads the real turn does, warming the Postgres pool and
 * compiling the route.
 *
 * Why the cache HITS: prompt caching is prefix-based. The cached prefix is
 * everything up to and including the 1h breakpoint in `system` plus the tools
 * block up to its breakpoint. This route feeds buildSystemPrompt the same
 * arguments the real voice turn uses — voiceActive:true (so the SPOKEN-OUTPUT
 * CONTRACT block sits in the prefix exactly as the spoken turn places it), the
 * same projects, the same userDisplayName — and buildToolDefinitions with the
 * same voiceActive:false. The volatile blocks (facts, snapshot, mode, temporal,
 * session-entities) all ride AFTER the breakpoint in the real turn, so they
 * never belong to the cached prefix; the warm-up does not need to reproduce
 * them for the cache to match.
 *
 * Strictly no side effects: no messages persisted, no SSE emits, no TTS, no DB
 * writes, no fact extraction, no executor. Idempotent — if the cache is already
 * warm the minimal call just reads it (creation 0) and returns fast.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const startedAt = Date.now();

  // Auth mirrors /api/jarvis/voice/transcript: desktop bearer (per-device
  // token → bound user) OR the headless ESP32 trigger-secret path.
  const desktopIdentity = await validateDesktopBearerIdentity(req);
  const desktopUserId = desktopIdentity?.userId ?? null;
  if (!desktopUserId) {
    const expected = process.env.PHYSICAL_TRIGGER_SECRET;
    const provided = req.headers.get("x-trigger-secret");
    if (!expected || !provided || !constantTimeEqual(provided, expected)) {
      return new Response("Unauthorized", { status: 401, headers: CORS });
    }
  }

  const userId = desktopUserId ?? (await findSingleUserId());
  if (!userId) {
    return Response.json(
      { ok: false, error: "no user identity for warmup" },
      { status: 409, headers: CORS },
    );
  }

  const anthropicKey =
    (await getUserKeyOrNull(userId, "anthropic")) ??
    process.env.ANTHROPIC_API_KEY ??
    "";
  if (!anthropicKey) {
    return Response.json(
      { ok: false, error: "no anthropic key for warmup" },
      { status: 409, headers: CORS },
    );
  }

  try {
    // Same reads the real turn does for the cached prefix + pool warm-up:
    // the project list (feeds the cached project-list block) and the user's
    // display name (feeds the cached USER CONTEXT block). Facts are read too
    // (they ride AFTER the breakpoint in the real turn; we read them only to
    // warm the pool / query cache, not because they affect the cached prefix).
    const [userProjects, userRows, userFacts] = await Promise.all([
      db
        .select({ id: projects.id, name: projects.name, icon: projects.icon })
        .from(projects)
        .where(eq(projects.userId, userId)),
      db
        .select({ displayName: users.displayName })
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

    // Build the IDENTICAL cacheable prefix the real voice turn builds:
    //  - voiceActive:true  → matches run-turn's speakingTurn (isVoice=true) so
    //    the SPOKEN-OUTPUT CONTRACT block sits inside the cached prefix exactly
    //    where the spoken turn puts it.
    //  - same projects + userDisplayName → byte-identical cached system blocks.
    //  - facts appended AFTER the 1h breakpoint (uncached), same as run-turn.
    // The snapshot / temporal / session-entities / mode blocks are all appended
    // AFTER the breakpoint in the real turn and therefore are NOT part of the
    // cached prefix — omitting them here does not change the cache key.
    const system = buildSystemPrompt({
      projects: projectSummaries,
      facts: userFacts as JarvisFact[],
      voiceActive: true,
      userDisplayName: userRows[0]?.displayName ?? null,
    });

    // Same tool definitions the real turn sends (voiceActive:false), carrying
    // the tools-tier cache breakpoint on the last cached tool.
    const tools = buildToolDefinitions({ voiceActive: false });

    const anth = getAnthropicClient(anthropicKey);

    // ONE minimal, non-streaming call: max_tokens 1, a trivial user message,
    // no forced tool. Its ONLY job is to make Anthropic create (or read) the
    // 1h prefix cache. tool_choice omitted → default auto; with a "warmup"
    // message the model produces a token or two, never an executed action —
    // and even if it emitted a tool_use block, nothing here runs it.
    const res = await anth.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 1,
      system: system as unknown as never,
      tools: tools as unknown as never,
      messages: [{ role: "user", content: "warmup" }],
    });

    const cacheRead =
      (res.usage as { cache_read_input_tokens?: number })
        .cache_read_input_tokens ?? 0;
    const cacheCreated =
      (res.usage as { cache_creation_input_tokens?: number })
        .cache_creation_input_tokens ?? 0;
    const ms = Date.now() - startedAt;

    console.log(`[warmup] cache read/create ${cacheRead} ${cacheCreated} in ${ms}ms`);

    return Response.json(
      { ok: true, cacheRead, cacheCreated, ms },
      { headers: CORS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[warmup] failed", err);
    return Response.json(
      { ok: false, error: message, ms: Date.now() - startedAt },
      { status: 500, headers: CORS },
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
