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

import { NextResponse, type NextRequest } from "next/server";
import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";
import { buildTurnHints } from "@/lib/jarvis/turn-hints";
import { createClient } from "@/lib/supabase/server";
import { getUserKey, MissingKeyError } from "@/lib/byok/keys";
import { checkRateLimit } from "@/lib/ratelimit/in-memory";
import {
  zCreateTask,
  zCreateCapture,
  zCreateEvent,
  zRememberFact,
  zAskClarification,
} from "@hyperpolymath/jarvis-core";

export const runtime = "nodejs";
export const maxDuration = 60;

// Abuse/DoS bounds. Even though each turn spends the user's OWN key (BYOK),
// an unbounded body inflates the user's own cost/latency and lets a script
// hammer the route. Cap turn rate per user and reject oversized payloads.
const RATE_LIMIT = { limit: 40, windowMs: 60_000 };
const MAX_INPUT_CHARS = 16_000;
const MAX_HISTORY_TURNS = 200;
const MAX_HISTORY_CHARS = 400_000;

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
    content:
      | string
      | Array<{
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
  linkedPeople?: Array<{ id: string; name: string }>;
}

export async function POST(req: NextRequest) {
  // 1. Auth — re-derive userId at boundary (JARVIS-12)
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claimsResult.data.claims.sub;

  // 1a. Per-user turn rate limit (best-effort, per-instance — dampens scripted
  //     abuse; not a hard global quota).
  const rl = checkRateLimit(`jarvis:${userId}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  // 1b. BYOK — resolve the requesting user's own Anthropic key BEFORE any SSE
  //     stream is opened. No owner env fallback: a public user spends only
  //     their own tokens. Missing key → 402 with a machine-readable provider so
  //     the UI can prompt inline.
  let anthropicKey: string;
  try {
    anthropicKey = await getUserKey(userId, "anthropic");
  } catch (e) {
    if (e instanceof MissingKeyError) {
      return NextResponse.json({ error: "key_missing", provider: e.provider }, { status: 402 });
    }
    throw e;
  }

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

  // 3b. Bound the payload before it reaches the model.
  if (typeof body.input !== "string" || body.input.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ error: "input_too_large" }, { status: 413 });
  }
  if (Array.isArray(body.history)) {
    if (
      body.history.length > MAX_HISTORY_TURNS ||
      JSON.stringify(body.history).length > MAX_HISTORY_CHARS
    ) {
      return NextResponse.json({ error: "history_too_large" }, { status: 413 });
    }
  } else {
    body.history = [];
  }

  // 4 + 5. Slash-command forcing via tool_choice, and the model-visible user
  //        message with system hints appended. Both rules now live in
  //        lib/jarvis/turn-hints.ts, shared with every other text channel:
  //          /task | /capture | /event → force the matching create_* tool
  //          /ask                       → forbid all tools (meta-question)
  //          /help                      → no override (client renders locally)
  //          (none + bare meta-question) → treat as /ask automatically
  //          (none)                     → auto-infer
  //        The persisted user turn keeps `body.input`; only `userContent`
  //        carries the hints.
  const { userContent, toolChoice } = buildTurnHints({
    input: body.input,
    slashCommand: body.slashCommand ?? null,
    parsedDates: body.parsedDates,
    parsedPriority: body.parsedPriority,
    linkedProjectIds: body.linkedProjectIds,
    linkedHashtags: body.linkedHashtags,
    linkedPeople: body.linkedPeople,
  });

  const messages: Array<{
    role: "user" | "assistant";
    content: string | Array<{ type: "text" | "tool_use" | "tool_result"; [key: string]: unknown }>;
  }> = [...body.history, { role: "user", content: userContent }];

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
        apiKey: anthropicKey,
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
        // Spoken tool-latency ack (voice turns only — run-turn gates on isVoice).
        // Emitted on a dedicated `ack` event, NOT `text`, so it never enters the
        // rendered/persisted assistant message. The browser voice consumer plays
        // it via TTS; a text turn never receives it.
        onAck: (text) => {
          controller.enqueue(encoder.encode(sse("ack", { text })));
        },
        onQueued: (toolUseId, name) => {
          controller.enqueue(encoder.encode(sse("queued", { toolUseId, name })));
        },
        onClarification: (toolUseId, question, options, suggestedAction) => {
          controller.enqueue(
            encoder.encode(sse("clarification", { toolUseId, question, options, suggestedAction }))
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
          controller.enqueue(encoder.encode(sse("action", { toolUseId, name, result })));
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
