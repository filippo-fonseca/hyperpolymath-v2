import type { NextRequest } from "next/server";

import { fireRoutineOverBus, resolveUserTimezone } from "@/lib/jarvis/routine-fire";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";
import { listRoutines } from "@/app/actions/routines";
import type { RoutineBlock } from "@hyperpolymath/jarvis-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Jarvis-Mode",
};

function readJarvisMode(req: NextRequest): "computer" | undefined {
  return req.headers.get("x-jarvis-mode") === "computer" ? "computer" : undefined;
}

interface RunRoutineBody {
  /** Load + run a persisted routine by id (routine-model persistence). */
  routineId?: unknown;
  /** OR run an inline spec — lets block-engine run without persistence. */
  routine?: {
    name?: unknown;
    blocks?: unknown;
    synthesize?: unknown;
    parallel?: unknown;
    loadingInstruction?: unknown;
  } | null;
  /** default true — desktop TTS is the primary consumer. */
  isVoice?: unknown;
  /** Option C: gather blocks silently + speak ONE synthesized brief. */
  synthesize?: unknown;
  /** Parallel gather (synthesize-only): run gather blocks concurrently. */
  parallel?: unknown;
}

/**
 * POST /api/jarvis/routines/run
 *
 * Executes a JARVIS routine (a trigger-fired sequence of agentic blocks) and
 * streams the result over the SAME physical SSE bus the desktop already
 * consumes. Each block emits its own `jarvis-response-start` → `-chunk` /
 * `-tool-call` → `-response-end` cycle keyed by a per-block `turnId` (= the
 * block's id), so a multi-block run is just N back-to-back response cycles on
 * one stream — the desktop needs ZERO protocol change to render/speak it.
 *
 * Accepts either an inline `{ routine: { name, blocks } }` (decoupled from
 * routine-model persistence) or a `{ routineId }` to load a stored routine.
 *
 * Owner-gated + bearer-authenticated, exactly like /api/jarvis/voice/text,
 * because the physical bus is a single global emitter (owner-only by design).
 *
 * Fire-and-forget: the run kicks off and the POST returns `{ ok, runId }`
 * immediately so a slow multi-block routine never holds the HTTP request open
 * past the function timeout. The desktop learns completion from the last
 * block's `jarvis-response-end`.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  const userId = identity.userId;
  const jarvisMode = readJarvisMode(req);

  // Owner-only while the physical bus is a single global emitter.
  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  let body: RunRoutineBody;
  try {
    body = (await req.json()) as RunRoutineBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const isVoice = body.isVoice === undefined ? true : Boolean(body.isVoice);

  // Resolve the routine — either inline or by loading a persisted one.
  let routineName: string;
  let blocks: RoutineBlock[];
  // Synthesis flag: an explicit top-level body flag wins; otherwise inherit
  // from the inline routine's / persisted spec's `synthesize` field.
  let synthesize = body.synthesize === undefined ? undefined : Boolean(body.synthesize);
  // Parallel-gather flag: same resolution precedence as synthesize (explicit
  // top-level wins → inline routine.parallel → persisted spec.parallel).
  let parallel = body.parallel === undefined ? undefined : Boolean(body.parallel);
  // Routine-level loading instruction: interpreted into a fresh opener line that
  // REPLACES the default. Sourced from the inline routine / persisted spec.
  let loadingInstruction: string | undefined;

  if (body.routine && Array.isArray(body.routine.blocks)) {
    routineName =
      typeof body.routine.name === "string" && body.routine.name.trim().length > 0
        ? body.routine.name.trim()
        : "routine";
    blocks = body.routine.blocks as RoutineBlock[];
    if (synthesize === undefined && body.routine.synthesize !== undefined) {
      synthesize = Boolean(body.routine.synthesize);
    }
    if (parallel === undefined && body.routine.parallel !== undefined) {
      parallel = Boolean(body.routine.parallel);
    }
    if (typeof body.routine.loadingInstruction === "string") {
      const t = body.routine.loadingInstruction.trim();
      if (t) loadingInstruction = t;
    }
  } else if (typeof body.routineId === "string" && body.routineId.length > 0) {
    const listed = await listRoutines();
    if (!listed.success) {
      return Response.json(
        { error: `Failed to load routines: ${listed.error}` },
        { status: 500, headers: CORS },
      );
    }
    const found = listed.data.find((r) => r.id === body.routineId);
    if (!found) {
      return Response.json({ error: "Routine not found" }, { status: 404, headers: CORS });
    }
    if (!found.enabled) {
      return Response.json({ error: "Routine is disabled" }, { status: 409, headers: CORS });
    }
    routineName = found.name;
    blocks = found.spec.blocks;
    if (synthesize === undefined) synthesize = found.spec.synthesize === true;
    if (parallel === undefined) parallel = found.spec.parallel === true;
    if (loadingInstruction === undefined) {
      const t = found.spec.loadingInstruction?.trim();
      if (t) loadingInstruction = t;
    }
  } else {
    return Response.json(
      { error: "Provide either { routine: { blocks } } or { routineId }" },
      { status: 400, headers: CORS },
    );
  }

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return Response.json({ error: "Routine has no blocks" }, { status: 400, headers: CORS });
  }

  // BYOK — owner-only physical/voice bus. Use the bound user's own Anthropic
  // key when configured; fall back to the owner's env key for the hardware
  // bridge path. Mirrors /api/jarvis/voice/text.
  const anthropicKey =
    (await getUserKeyOrNull(userId, "anthropic")) ??
    process.env.ANTHROPIC_API_KEY ??
    "";

  // Local timezone for the opener / filler greeting contract — sourced the same
  // way run-turn.ts sources it (users.timezone, fallback America/New_York).
  const timezone = await resolveUserTimezone(userId);

  // Fire-and-forget: stream the whole run over the physical SSE bus (each block
  // = one turnId, so the desktop segments + speaks a multi-block run with no
  // protocol change). Shared with the voice-transcript utterance interception.
  const runId = fireRoutineOverBus(blocks, {
    userId,
    apiKey: anthropicKey,
    isVoice,
    mode: jarvisMode,
    synthesize: synthesize === true,
    parallel: parallel === true,
    routineName,
    loadingInstruction,
    timezone,
    abortSignal: req.signal,
  });

  return Response.json({ ok: true, runId, blockCount: blocks.length }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
