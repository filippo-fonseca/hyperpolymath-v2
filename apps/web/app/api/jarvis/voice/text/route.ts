import type { NextRequest } from "next/server";

import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
  emitJarvisToolCall,
  emitPhysicalTranscript,
} from "@/lib/voice/physical-extension/bus";
import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";
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
// ContentBlock mirrors the Anthropic API content-block shapes.
// Mobile clients (Phase 16 parity) send prior-turn history so the model can
// resolve entity references across turns (e.g. "the task I just created").
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

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
   */
  history?: Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }>;
}

export async function POST(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  const userId = identity.userId;

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

  // Slash-command forcing + system hints — mirrors /api/jarvis (browser
  // route). Keep the two in sync: /task|/capture|/event force the matching
  // tool, /ask (or a bare meta-question) forbids tools, hints are appended
  // to the model-visible message only — the persisted user turn stays clean.
  const META_QUESTION_RE =
    /^(what\s+(?:did|do|does|are|is|was|were|have|will)|did\s+(?:i|we|you)|do\s+(?:i|we|you)|have\s+(?:i|we|you)|show\s+me|tell\s+me|list\s+|summari[sz]e|recap|how\s+many|how\s+much)\b/i;
  const askMode =
    body.slashCommand === "ask" || (!body.slashCommand && META_QUESTION_RE.test(text));

  const toolChoice: { type: "auto" } | { type: "none" } | { type: "tool"; name: string } =
    askMode
      ? { type: "none" as const }
      : body.slashCommand
        ? { type: "tool" as const, name: `create_${body.slashCommand}` }
        : { type: "auto" as const };

  let userContent = text;
  if (body.parsedDates && body.parsedDates.length > 0) {
    userContent += `\n\n[SYSTEM-PARSED DATES — MANDATORY: copy these ISO strings verbatim into the relevant tool field (due/start/end). Do NOT call new Date() or re-parse. If allDay=true the user gave no time-of-day; use the start value as-is. ${JSON.stringify(body.parsedDates)}]`;
  }
  if (body.parsedPriority) {
    userContent += `\n\n[SYSTEM-PARSED PRIORITY — MANDATORY: the user typed an explicit priority token. Set create_task.priority to exactly "${body.parsedPriority}". Do not default to P3.]`;
  }
  if (askMode) {
    userContent += `\n\n[META-QUESTION MODE${body.slashCommand === "ask" ? " (/ask)" : ""}: this turn answers a question; do NOT call any tool. Reply with 1-3 plain English sentences using the visible conversation history. The "OUTPUT FORMAT: emit tool calls only" rule does NOT apply this turn. Your prose IS the response and WILL render to the user.]`;
  }
  if ((body.linkedProjectIds?.length ?? 0) > 0 || (body.linkedHashtags?.length ?? 0) > 0) {
    const parts: string[] = [];
    if (body.linkedProjectIds && body.linkedProjectIds.length > 0) {
      parts.push(`projects=${JSON.stringify(body.linkedProjectIds)}`);
    }
    if (body.linkedHashtags && body.linkedHashtags.length > 0) {
      parts.push(`hashtags=${JSON.stringify(body.linkedHashtags)}`);
    }
    userContent += `\n\n[Linked references in this message (client-validated): ${parts.join(", ")}]`;
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

  // Build the messages array: prior history (capped at 10 entries) followed
  // by the current user turn with system hints injected.
  const historyEntries = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const messages: Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }> = [
    ...historyEntries,
    { role: "user", content: userContent },
  ];

  // BYOK — owner-only physical/voice bus. Use the bound user's own Anthropic
  // key when configured; fall back to the owner's env key for the hardware
  // bridge path.
  const anthropicKey =
    (await getUserKeyOrNull(userId, "anthropic")) ??
    process.env.ANTHROPIC_API_KEY ??
    "";

  void runJarvisTurnStream({
    userId,
    apiKey: anthropicKey,
    input: text,
    messages,
    toolChoice,
    parsedPriority: body.parsedPriority,
    source: { device: identity.deviceName, input: "text" },
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
