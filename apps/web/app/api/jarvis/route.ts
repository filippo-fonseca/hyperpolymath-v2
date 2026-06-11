/**
 * POST /api/jarvis — JARVIS Console SSE Route Handler.
 *
 * Thin SSE wrapper around runJarvisTurnStream (lib/jarvis/run-turn.ts).
 * Auth + getClaims + SSE event emission live here. Core Anthropic stream
 * loop + DB context loading + executor dispatch live in the helper.
 *
 * INVARIANTS:
 *   - Node runtime (Edge cannot host googleapis + postgres-js + drizzle).
 *   - getClaims() for auth — JWT-validating (per CLAUDE.md Critical Pattern 1).
 *   - userId is re-derived at the boundary — model never emits userId.
 *   - X-Accel-Buffering: no header (Vercel proxy must not buffer SSE).
 *   - AbortController propagation: client cancel → upstream Anthropic cancel.
 *
 * SSE event shape:
 *   event: turn-start  data: { turnId: string }
 *   event: text        data: { delta: string }
 *   event: queued      data: { toolUseId, name }
 *   event: clarification data: { toolUseId, question, options, suggestedAction }
 *   event: action      data: { toolUseId, name, result: ExecutorResult }
 *   event: done        data: { usage: { input_tokens, output_tokens,
 *                                       cache_read_input_tokens,
 *                                       cache_creation_input_tokens } }
 *   event: error       data: { message: string }
 */

import type { NextRequest } from "next/server";
import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";
import { createClient } from "@/lib/supabase/server";
import {
  zCreateTask,
  zCreateCapture,
  zCreateEvent,
  zRememberFact,
  zAskClarification,
} from "@hyperpolymath/jarvis-core";

export const runtime = "nodejs";
export const maxDuration = 60;

// Touch the non-voice exports so tree-shaking doesn't drop them (still
// referenced by test fixtures and external consumers via index.ts barrel).
void zCreateTask;
void zCreateCapture;
void zCreateEvent;
void zRememberFact;
void zAskClarification;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface JarvisRequestBody {
  input: string;
  // Phase 16: Anthropic content-block-compatible — assistant turns may carry
  // tool_use blocks, and user turns may carry tool_result blocks. String
  // content remains valid for plain text turns (backward-compatible widening).
  history: Array<{
    role: "user" | "assistant";
    content: string | Array<{
      type: "text" | "tool_use" | "tool_result";
      [key: string]: unknown;
    }>;
  }>;
  parsedDates?: Array<{
    text: string;
    start: string;
    end?: string;
    allDay?: boolean;
  }>;
  parsedPriority?: "P∞" | "P1" | "P2" | "P3";
  slashCommand?: "task" | "capture" | "event" | "ask" | "help" | null;
  linkedProjectIds?: string[];
  linkedHashtags?: string[];
}

export async function POST(req: NextRequest) {
  // 1. Auth — re-derive userId at boundary (JARVIS-12)
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claimsResult.data.claims.sub;

  // 2. Voice + timing headers
  const voiceActive = req.headers.get("X-Voice-Active") === "true";

  const sttDoneAtHeader = req.headers.get("X-Jarvis-Stt-Done-At");
  const sttDoneAt: number | null = sttDoneAtHeader ? Number(sttDoneAtHeader) : null;

  const vadEndAtHeader = req.headers.get("X-Jarvis-Vad-End-At");
  const vadEndAt = vadEndAtHeader ? Number(vadEndAtHeader) : undefined;

  // 3. Request body
  let body: JarvisRequestBody;
  try {
    body = (await req.json()) as JarvisRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // 4. Slash-command forcing via tool_choice
  //    /task | /capture | /event → force the matching create_* tool
  //    /ask                       → forbid all tools (text-only meta-question)
  //    /help                      → no override (client renders help locally)
  //    (none + bare meta-question) → treat as /ask automatically
  //    (none)                     → auto-infer
  const META_QUESTION_RE =
    /^(what\s+(?:did|do|does|are|is|was|were|have|will)|did\s+(?:i|we|you)|do\s+(?:i|we|you)|have\s+(?:i|we|you)|show\s+me|tell\s+me|list\s+|summari[sz]e|recap|how\s+many|how\s+much)\b/i;
  const bareMetaQuestion =
    !body.slashCommand && META_QUESTION_RE.test(body.input.trim());
  const askMode = body.slashCommand === "ask" || bareMetaQuestion;
  const isClarificationReply = body.input.trimStart().startsWith("[CLARIFICATION REPLY]");

  const toolChoice: { type: "auto" } | { type: "none" } | { type: "tool"; name: string } = askMode
    ? { type: "none" as const }
    : body.slashCommand && body.slashCommand !== "help"
      ? { type: "tool" as const, name: `create_${body.slashCommand}` }
      : { type: "auto" as const };

  // 5. Build user content with system hints
  let userContent = body.input;
  if (body.parsedDates && body.parsedDates.length > 0) {
    userContent += `\n\n[SYSTEM-PARSED DATES — MANDATORY: copy these ISO strings verbatim into the relevant tool field (due/start/end). Do NOT call new Date() or re-parse. If allDay=true the user gave no time-of-day; use the start value as-is. ${JSON.stringify(body.parsedDates)}]`;
  }
  if (body.parsedPriority) {
    userContent += `\n\n[SYSTEM-PARSED PRIORITY — MANDATORY: the user typed an explicit priority token. Set create_task.priority to exactly "${body.parsedPriority}". Do not default to P3.]`;
  }
  if (askMode) {
    userContent += `\n\n[META-QUESTION MODE${body.slashCommand === "ask" ? " (/ask)" : ""}: this turn answers a question; do NOT call any tool. Reply with 1-3 plain English sentences using the visible conversation history. The "OUTPUT FORMAT: emit tool calls only" rule does NOT apply this turn. Your prose IS the response and WILL render to the user.]`;
  }
  if (
    (body.linkedProjectIds?.length ?? 0) > 0 ||
    (body.linkedHashtags?.length ?? 0) > 0
  ) {
    const parts: string[] = [];
    if (body.linkedProjectIds && body.linkedProjectIds.length > 0) {
      parts.push(`projects=${JSON.stringify(body.linkedProjectIds)}`);
    }
    if (body.linkedHashtags && body.linkedHashtags.length > 0) {
      parts.push(`hashtags=${JSON.stringify(body.linkedHashtags)}`);
    }
    userContent += `\n\n[Linked references in this message (client-validated): ${parts.join(", ")}]`;
  }
  if (isClarificationReply) {
    userContent += `\n\n[INTERNAL: This message is a reply to your previous ask_clarification. Do NOT emit another ask_clarification this turn — execute the action now using the user's clarification, or fall back to capture-first if still ambiguous. Depth cap enforced (Pitfall 2).]`;
  }

  const messages: Array<{
    role: "user" | "assistant";
    content: string | Array<{ type: "text" | "tool_use" | "tool_result"; [key: string]: unknown }>;
  }> = [
    ...body.history,
    { role: "user", content: userContent },
  ];

  // 6. allDay lookup for receipt enrichment
  const parsedDateAllDayByIso = new Map<string, boolean>();
  for (const pd of body.parsedDates ?? []) {
    if (pd.allDay === true) {
      parsedDateAllDayByIso.set(pd.start, true);
      if (pd.end) parsedDateAllDayByIso.set(pd.end, true);
    }
  }
  function isAllDayIso(iso: unknown): boolean {
    return typeof iso === "string" && parsedDateAllDayByIso.get(iso) === true;
  }

  // 7. AbortController propagation: client req.signal → upstream signal
  const upstream = new AbortController();
  const onAbort = () => upstream.abort();
  req.signal.addEventListener("abort", onAbort, { once: true });

  // 8. Build SSE stream
  const encoder = new TextEncoder();
  const turnId = crypto.randomUUID();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sse("turn-start", { turnId })));

      await runJarvisTurnStream({
        userId,
        turnId,
        input: body.input,
        messages,
        toolChoice,
        parsedPriority: body.parsedPriority,
        source: { device: "Web", input: voiceActive ? "voice" : "text" },
        isVoice: voiceActive,
        sttDoneAt: sttDoneAt && !Number.isNaN(sttDoneAt) ? sttDoneAt : null,
        vadEndAt: vadEndAt && !Number.isNaN(vadEndAt) ? vadEndAt : undefined,
        abortSignal: upstream.signal,
        onTextDelta: (delta) => {
          controller.enqueue(encoder.encode(sse("text", { delta })));
        },
        onQueued: (toolUseId, name) => {
          controller.enqueue(encoder.encode(sse("queued", { toolUseId, name })));
        },
        onClarification: (toolUseId, question, options, suggestedAction) => {
          controller.enqueue(
            encoder.encode(
              sse("clarification", { toolUseId, question, options, suggestedAction }),
            ),
          );
        },
        onAction: (toolUseId, name, result) => {
          // Attach authoritative allDay flag to the receipt.
          if (
            result &&
            (result as { ok?: boolean }).ok === true &&
            (result as { receipt?: Record<string, unknown> }).receipt
          ) {
            const r = (result as { receipt: Record<string, unknown> }).receipt;
            if (name === "create_task" && typeof r.due === "string") {
              r.allDay = isAllDayIso(r.due);
            } else if (name === "create_event") {
              if (typeof r.start === "string") {
                r.allDay = isAllDayIso(r.start);
              }
            }
          }
          controller.enqueue(
            encoder.encode(sse("action", { toolUseId, name, result })),
          );
        },
        onDone: (usage) => {
          controller.enqueue(encoder.encode(sse("done", { usage })));
        },
        onError: (message) => {
          controller.enqueue(encoder.encode(sse("error", { message })));
        },
      });

      req.signal.removeEventListener("abort", onAbort);
      controller.close();
    },
    cancel() {
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
