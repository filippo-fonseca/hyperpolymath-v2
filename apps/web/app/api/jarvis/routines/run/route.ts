import type { NextRequest } from "next/server";

import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
  emitJarvisToolCall,
} from "@/lib/voice/physical-extension/bus";
import { runRoutine } from "@/lib/jarvis/routine-runner";
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
  routine?: { name?: unknown; blocks?: unknown } | null;
  /** default true — desktop TTS is the primary consumer. */
  isVoice?: unknown;
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

  if (body.routine && Array.isArray(body.routine.blocks)) {
    routineName =
      typeof body.routine.name === "string" && body.routine.name.trim().length > 0
        ? body.routine.name.trim()
        : "routine";
    blocks = body.routine.blocks as RoutineBlock[];
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

  const runId = crypto.randomUUID();

  // Fire-and-forget: stream the whole run over the physical SSE bus. Each block
  // maps to one turnId (= its blockId) so the desktop's per-turn listeners
  // segment the run cleanly, speaking each block back-to-back.
  void runRoutine(
    blocks,
    {
      userId,
      apiKey: anthropicKey,
      source: { device: "routine", input: isVoice ? "voice" : "text" },
      isVoice,
      mode: jarvisMode,
      routineName,
      runId,
      abortSignal: req.signal,
    },
    {
      onBlockStart: (blockId) => {
        emitJarvisResponseStart({ turnId: blockId, at: Date.now() });
      },
      onTextDelta: (blockId, delta) => {
        emitJarvisResponseChunk({ turnId: blockId, delta, at: Date.now() });
      },
      onAction: (blockId, toolUseId, name, result) => {
        emitJarvisToolCall({ turnId: blockId, toolUseId, name, result, at: Date.now() });
      },
      onBlockDone: (result) => {
        // On an errored block, onError already surfaced the message; still emit
        // exactly one response-end here (the single close for the block turnId).
        emitJarvisResponseEnd({ turnId: result.blockId, at: Date.now() });
      },
      onError: (blockId, message) => {
        // Surface the error into the block's spoken stream; the matching
        // response-end is emitted once by onBlockDone (which always fires after
        // the block settles), so we do NOT close here to avoid a double-end.
        emitJarvisResponseChunk({
          turnId: blockId,
          delta: `(routine block error: ${message})`,
          at: Date.now(),
        });
      },
      onRoutineDone: () => {
        // Completion is observable from the last block's response-end; no
        // dedicated marker in v1 (see UNIT-PLAN §6.3 — deferred).
      },
    },
  ).catch((err: unknown) => {
    console.error("[routines/run] routine execution failed", err);
  });

  return Response.json({ ok: true, runId, blockCount: blocks.length }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
