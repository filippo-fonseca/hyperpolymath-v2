import Groq from "groq-sdk";
import type { NextRequest } from "next/server";

import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
  emitJarvisToolCall,
  emitPhysicalTranscript,
} from "@/lib/voice/physical-extension/bus";
import { findSingleUserId } from "@/lib/jarvis/find-single-user";
import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { isOwnerUser } from "@/lib/auth/owner";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Trigger-Secret, X-Jarvis-Vad-End-At, X-Jarvis-Probe, X-Jarvis-Mode",
};

/**
 * Normalize the `X-Jarvis-Mode` header (Phase 2). Only "computer" is honored;
 * the headless ESP32 bridge sends no such header → undefined (unchanged).
 */
function readJarvisMode(req: NextRequest): "computer" | undefined {
  return req.headers.get("x-jarvis-mode") === "computer" ? "computer" : undefined;
}

// "Done, JARVIS" — the desktop hands-free end-of-turn phrase. Stripped from the
// tail of the transcript so the agent never sees the control phrase as content.
const STOP_PHRASE_TAIL = /[\s,.!?]*\bdone[,]?\s+jarvis\b[\s.!?]*$/i;

export async function POST(req: NextRequest): Promise<Response> {
  // Two acceptable callers:
  //   1. Desktop app — Authorization: Bearer hpd_... (per-device token,
  //      revocable from /settings/desktop). The right path going forward.
  //   2. ESP32 bridge — X-Trigger-Secret matching PHYSICAL_TRIGGER_SECRET.
  //      Kept for the dedicated hardware path which has no user account.
  const desktopIdentity = await validateDesktopBearerIdentity(req);
  const desktopUserId = desktopIdentity?.userId ?? null;
  if (!desktopUserId) {
    const expected = process.env.PHYSICAL_TRIGGER_SECRET;
    const provided = req.headers.get("x-trigger-secret");
    if (!expected || !provided || !constantTimeEqual(provided, expected)) {
      return new Response("Unauthorized", { status: 401, headers: CORS });
    }
  }

  const audioBuffer = await req.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return Response.json({ error: "Empty audio body" }, { status: 400, headers: CORS });
  }
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio too large (max 25MB)" }, { status: 413, headers: CORS });
  }

  const vadEndAtHeader = req.headers.get("x-jarvis-vad-end-at");
  const vadEndAt = vadEndAtHeader ? Number(vadEndAtHeader) : undefined;
  const jarvisMode = readJarvisMode(req);

  const file = new File([audioBuffer], "audio.wav", { type: "audio/wav" });

  // BYOK — owner-only physical/voice bus. Use the bound user's own Groq key
  // when this turn has a user identity; otherwise (keyless ESP32 trigger-secret
  // path) fall back to the owner's env key for the dedicated hardware bridge.
  const groqUserId = desktopUserId ?? (await findSingleUserId());
  const groqKey =
    (groqUserId ? await getUserKeyOrNull(groqUserId, "groq") : null) ??
    process.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey: groqKey });

  let transcript: string;
  let sttDoneAt: number;

  try {
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      language: "en",
    });
    sttDoneAt = Date.now();
    transcript = transcription.text;
  } catch (err) {
    console.error("[voice/transcript] Groq failed", err);
    return Response.json({ error: "STT failed" }, { status: 500, headers: CORS });
  }

  // Probe mode: the desktop polls a rolling audio tail to detect the
  // "Done, JARVIS" stop phrase. Return the raw transcript ONLY — no SSE
  // fan-out, no DB persistence, no agent run.
  if (req.headers.get("x-jarvis-probe") === "1") {
    return Response.json({ transcript, sttDoneAt }, { headers: CORS });
  }

  // Strip a trailing "Done, JARVIS" stop phrase before anything downstream
  // sees it. If the user only said the phrase, drop the (empty) turn.
  transcript = transcript.replace(STOP_PHRASE_TAIL, "").trim();
  if (!transcript) {
    return Response.json({ transcript: "", sttDoneAt }, { headers: CORS });
  }

  // 2026-06 multi-user fix: when a desktop bearer authenticated the request,
  // that token is BOUND to a specific user — always honor it. Only the
  // headless ESP32 path (validated via PHYSICAL_TRIGGER_SECRET, with no per-
  // device identity) falls back to findSingleUserId, which keeps the legacy
  // hardware bridge working on personal single-user installs.
  const userId = desktopUserId ?? (await findSingleUserId());
  if (!userId) {
    return Response.json(
      {
        error:
          "no user identity for this voice turn — pair the desktop app at /settings/desktop",
      },
      { status: 409, headers: CORS },
    );
  }

  // Owner-only while the physical bus is a single global emitter (see
  // lib/auth/owner.ts). Resolve identity BEFORE emitting so a non-owner's
  // transcript never reaches the shared SSE stream.
  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  emitPhysicalTranscript({
    transcript,
    sttDoneAt,
    vadEndAt: Number.isFinite(vadEndAt) ? (vadEndAt as number) : undefined,
    at: sttDoneAt,
  });

  const turnId = crypto.randomUUID();
  const userTurnId = crypto.randomUUID();
  const userTurnCreatedAt = new Date();
  const assistantTurnCreatedAt = new Date(userTurnCreatedAt.getTime() + 1);

  // Persist the user turn immediately — visible on next browser load even if
  // the tab was closed before the response completes.
  void db
    .insert(jarvisTurns)
    .values({
      id: userTurnId,
      userId,
      kind: "user",
      text: transcript,
      textDelta: null,
      actions: [],
      clarification: null,
      status: null,
      errorMessage: null,
      createdAt: userTurnCreatedAt,
    })
    .onConflictDoNothing()
    .catch((err: unknown) => {
      console.error("[voice/transcript] failed to persist user turn", err);
    });

  // BYOK — resolve the owner's own Anthropic key for the voice turn; fall back
  // to the env key for the keyless hardware bridge path.
  const anthropicKey =
    (await getUserKeyOrNull(userId, "anthropic")) ??
    process.env.ANTHROPIC_API_KEY ??
    "";

  emitJarvisResponseStart({ turnId, at: Date.now() });

  // Accumulate assistant response for DB persistence on completion.
  let assistantText = "";
  const assistantActions: Array<{ toolUseId: string; name: string; result: unknown }> = [];

  void runJarvisTurnStream({
    userId,
    apiKey: anthropicKey,
    input: transcript,
    // Provenance: paired-device token name; the headless ESP32 path has no
    // token identity, so it reads as the physical extender.
    source: { device: desktopIdentity?.deviceName ?? "Physical extender", input: "voice" },
    isVoice: true,
    mode: jarvisMode,
    sttDoneAt,
    vadEndAt: Number.isFinite(vadEndAt) ? (vadEndAt as number) : undefined,
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
      // Persist the completed assistant turn so browser chat history shows
      // desktop-originated turns on next page load.
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
          console.error("[voice/transcript] failed to persist assistant turn", err);
        });
    },
    onError: (message) => {
      emitJarvisResponseEnd({ turnId, at: Date.now() });
      // Persist the error turn so the browser shows failed turns on reload.
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
          console.error("[voice/transcript] failed to persist error turn", err);
        });
    },
  });

  return Response.json({ transcript, turnId }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
