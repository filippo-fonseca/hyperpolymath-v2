import type { NextRequest } from "next/server";

import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
  emitJarvisToolCall,
  emitPhysicalTranscript,
} from "@/lib/voice/physical-extension/bus";
import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";
import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_CHARS = 4000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * POST /api/jarvis/voice/text
 *
 * Text-input twin of /api/jarvis/voice/transcript for paired devices
 * (mobile app text bar, desktop fallback). Accepts JSON { text } with a
 * device bearer token, skips STT, and spawns the same server-side JARVIS
 * turn — response streams to all listeners via the physical SSE bus.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  let text: string;
  try {
    const body = (await req.json()) as { text?: unknown };
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
  emitPhysicalTranscript({ transcript: text, sttDoneAt: receivedAt, at: receivedAt });

  const turnId = crypto.randomUUID();
  const userTurnId = crypto.randomUUID();
  const userTurnCreatedAt = new Date();
  const assistantTurnCreatedAt = new Date(userTurnCreatedAt.getTime() + 1);

  void db
    .insert(jarvisTurns)
    .values({
      id: userTurnId,
      userId,
      kind: "user",
      text,
      textDelta: null,
      actions: [],
      clarification: null,
      status: null,
      errorMessage: null,
      createdAt: userTurnCreatedAt,
    })
    .onConflictDoNothing()
    .catch((err: unknown) => {
      console.error("[voice/text] failed to persist user turn", err);
    });

  emitJarvisResponseStart({ turnId, at: Date.now() });

  let assistantText = "";
  const assistantActions: Array<{ toolUseId: string; name: string; result: unknown }> = [];

  void runJarvisTurnStream({
    userId,
    input: text,
    isVoice: false,
    sttDoneAt: null,
    vadEndAt: undefined,
    onTextDelta: (delta) => {
      assistantText += delta;
      emitJarvisResponseChunk({ turnId, delta, at: Date.now() });
    },
    onAction: (toolUseId, name, result) => {
      assistantActions.push({ toolUseId, name, result });
      emitJarvisToolCall({ turnId, toolUseId, name, result, at: Date.now() });
    },
    onDone: () => {
      emitJarvisResponseEnd({ turnId, at: Date.now() });
      void db
        .insert(jarvisTurns)
        .values({
          id: turnId,
          userId,
          kind: "assistant",
          text: null,
          textDelta: assistantText,
          actions: assistantActions,
          clarification: null,
          status: "done",
          errorMessage: null,
          createdAt: assistantTurnCreatedAt,
        })
        .onConflictDoUpdate({
          target: jarvisTurns.id,
          set: {
            textDelta: assistantText,
            actions: assistantActions,
            status: "done",
            errorMessage: null,
          },
        })
        .catch((err: unknown) => {
          console.error("[voice/text] failed to persist assistant turn", err);
        });
    },
    onError: (message) => {
      emitJarvisResponseEnd({ turnId, at: Date.now() });
      void db
        .insert(jarvisTurns)
        .values({
          id: turnId,
          userId,
          kind: "assistant",
          text: null,
          textDelta: assistantText || null,
          actions: assistantActions,
          clarification: null,
          status: "error",
          errorMessage: message,
          createdAt: assistantTurnCreatedAt,
        })
        .onConflictDoUpdate({
          target: jarvisTurns.id,
          set: {
            textDelta: assistantText || null,
            actions: assistantActions,
            status: "error",
            errorMessage: message,
          },
        })
        .catch((err: unknown) => {
          console.error("[voice/text] failed to persist error turn", err);
        });
    },
  });

  return Response.json({ turnId }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
