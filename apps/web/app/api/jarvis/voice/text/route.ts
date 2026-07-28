import type { NextRequest } from "next/server";

import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
  emitJarvisToolCall,
  emitPhysicalTranscript,
} from "@/lib/voice/physical-extension/bus";
import {
  runChannelTurn,
  type ChannelMessage,
} from "@/lib/jarvis/run-channel-turn";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_CHARS = 4000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Jarvis-Mode",
};

/**
 * Normalize the `X-Jarvis-Mode` header (Phase 2). Only "computer" is honored;
 * anything else (or absent) → undefined, preserving browser/mobile behaviour.
 */
function readJarvisMode(req: NextRequest): "computer" | undefined {
  return req.headers.get("x-jarvis-mode") === "computer" ? "computer" : undefined;
}

/**
 * POST /api/jarvis/voice/text
 *
 * Text-input twin of /api/jarvis/voice/transcript for paired devices
 * (mobile app text bar, desktop fallback). Accepts JSON { text } with a
 * device bearer token, skips STT, and spawns the same server-side JARVIS
 * turn — response streams to all listeners via the physical SSE bus.
 *
 * This route is now a THIN WRAPPER: auth, the physical-bus emits and the
 * request contract live here, while key resolution, hint injection,
 * tool_choice, history and jarvis_turns persistence live in
 * lib/jarvis/run-channel-turn.ts, shared with every other text channel. The
 * roughly 180 lines this file used to duplicate from app/api/jarvis/route.ts
 * (and the "keep the two in sync" comment that came with them) are gone.
 */
interface VoiceTextBody {
  text?: unknown;
  parsedDates?: Array<{ text: string; start: string; end?: string; allDay?: boolean }>;
  parsedPriority?: "P∞" | "P1" | "P2" | "P3";
  slashCommand?: "task" | "capture" | "event" | "ask" | null;
  linkedProjectIds?: string[];
  linkedHashtags?: string[];
  /**
   * Optional conversation history from paired clients (mobile app, desktop).
   * Each entry is a prior assistant or user turn. The last entry MUST be a
   * user turn carrying tool_result blocks for any tool_use in the preceding
   * assistant turn (Anthropic API Pitfall 1). Max 10 entries enforced below.
   * When absent or empty, the shared core falls back to buildRecentHistory.
   */
  history?: ChannelMessage[];
}

export async function POST(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  const userId = identity.userId;
  const jarvisMode = readJarvisMode(req);

  // Owner-only while the physical bus is a single global emitter (see
  // lib/auth/owner.ts) — its events fan out to the shared SSE stream.
  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  let text: string;
  let body: VoiceTextBody;
  try {
    body = (await req.json()) as VoiceTextBody;
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }
  if (!text) {
    return Response.json({ error: "Empty text" }, { status: 400, headers: CORS });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return Response.json(
      { error: `Text too long (max ${MAX_TEXT_CHARS} chars)` },
      { status: 413, headers: CORS },
    );
  }

  const receivedAt = Date.now();
  // Mint the reply turnId BEFORE the echo emit and stamp it on the echo so the
  // desktop reducer can pair the user bubble to its reply by identity (FIFO is
  // the fallback for turnless echoes; identity is exact under any overlap).
  const turnId = crypto.randomUUID();
  emitPhysicalTranscript({ transcript: text, sttDoneAt: receivedAt, at: receivedAt, turnId });
  emitJarvisResponseStart({ turnId, at: Date.now() });

  // Client-supplied history wins when present; otherwise the core loads the
  // server-side recency window itself.
  const clientHistory = Array.isArray(body.history) ? body.history.slice(-10) : [];

  // Fire and forget: the caller only needs the turnId, and every downstream
  // event reaches listeners over the physical bus.
  void runChannelTurn({
    userId,
    text,
    deviceLabel: identity.deviceName,
    turnId,
    history: clientHistory.length > 0 ? clientHistory : undefined,
    slashCommand: body.slashCommand ?? null,
    parsedDates: body.parsedDates,
    parsedPriority: body.parsedPriority,
    linkedProjectIds: body.linkedProjectIds,
    linkedHashtags: body.linkedHashtags,
    mode: jarvisMode,
    isVoice: false,
    onTextDelta: (delta) => {
      emitJarvisResponseChunk({ turnId, delta, at: Date.now() });
    },
    onAction: (toolUseId, name, result) => {
      emitJarvisToolCall({ turnId, toolUseId, name, result, at: Date.now() });
    },
    onDone: () => {
      emitJarvisResponseEnd({ turnId, at: Date.now() });
    },
    onError: () => {
      emitJarvisResponseEnd({ turnId, at: Date.now() });
    },
  }).catch((err: unknown) => {
    console.error("[voice/text] channel turn failed", err);
    emitJarvisResponseEnd({ turnId, at: Date.now() });
  });

  return Response.json({ turnId }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
