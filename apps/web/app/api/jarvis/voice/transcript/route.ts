import Groq from "groq-sdk";
import { after, type NextRequest } from "next/server";

import {
  emitJarvisAck,
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
  emitJarvisToolCall,
  emitPhysicalTranscript,
} from "@/lib/voice/physical-extension/bus";
import { registerTurnAbort, unregisterTurnAbort } from "@/lib/jarvis/turn-abort-registry";
import { phraseMatches } from "@hyperpolymath/jarvis-core/routines";
import { findSingleUserId } from "@/lib/jarvis/find-single-user";
import {
  fireRoutineOverBus,
  getEnabledRoutines,
  resolveUserTimezone,
} from "@/lib/jarvis/routine-fire";
import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";
import { buildRecentHistory } from "@/lib/jarvis/recent-history";
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
  // maxRetries: 0 kills the SDK's silent retry-after backoff (a 429 with
  // `retry-after: 44` otherwise makes it sleep 44s and retry invisibly, which
  // is the source of the 44–89s voice-turn hangs). timeout caps a genuinely
  // slow inference call. In-provider model fallback (below) handles the 429.
  const groq = new Groq({ apiKey: groqKey, maxRetries: 0, timeout: 15_000 });

  // Try turbo first, then fall back to whisper-large-v3 on ANY error (429 /
  // timeout / 5xx). Empirically the two models sit on SEPARATE daily quota
  // buckets, so when turbo is exhausted (or slow) v3 still serves in ~0.5s.
  // distil-whisper-large-v3-en is decommissioned on Groq — do not add it.
  const STT_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"] as const;

  let transcript: string;
  let sttDoneAt: number;

  const sttStartedAt = Date.now();
  let transcription: Awaited<ReturnType<typeof groq.audio.transcriptions.create>> | undefined;
  let lastErr: unknown;
  for (const model of STT_MODELS) {
    try {
      transcription = await groq.audio.transcriptions.create({
        file,
        model,
        response_format: "json",
        language: "en",
      });
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`[voice-timing] stt ${model} failed status=${(err as { status?: number })?.status}`);
    }
  }
  if (!transcription) {
    console.error("[voice/transcript] Groq failed", lastErr);
    return Response.json({ error: "STT failed" }, { status: 500, headers: CORS });
  }
  sttDoneAt = Date.now();
  console.log(`[voice-timing] stt ${sttDoneAt - sttStartedAt}ms`);
  transcript = (transcription as { text: string }).text;

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

  // Utterance/wake routine interception. If this transcript matches an enabled
  // phrase-triggered routine, run that routine's blocks over the SSE bus INSTEAD
  // of a normal conversation turn. This makes an utterance trigger fire from ANY
  // state — idle OR mid-conversation — which is what the editor promises (the
  // desktop idle probe alone only caught the narrow idle window). Fail-open: any
  // error here falls through to a normal turn.
  try {
    const enabledRoutines = await getEnabledRoutines(userId);
    const matched = enabledRoutines.find((r) =>
      r.spec.triggers.some(
        (t) =>
          (t.type === "utterance" && phraseMatches(transcript, t.match)) ||
          (t.type === "wake" && phraseMatches(transcript, t.phrase)),
      ),
    );
    if (matched) {
      console.log(
        `[voice/transcript] utterance matched routine "${matched.name}" (${matched.id}) — firing ${matched.spec.blocks.length} block(s) instead of a normal turn`,
      );
      // Mint the turn identity BEFORE emitting the user echo, and thread it into
      // the routine fire as echoTurnId. The routine runs fire-and-forget, so its
      // first response-start can land at the client AFTER a concurrent normal
      // turn's; stamping the SAME id on the echo lets the desktop reducer pair
      // the user bubble to the routine's first reply by identity rather than by
      // arrival order (which would otherwise swap rows under that interleaving).
      const routineTurnId = crypto.randomUUID();
      // Show the user's spoken phrase, then stream the routine's spoken blocks.
      emitPhysicalTranscript({
        transcript,
        sttDoneAt,
        vadEndAt: Number.isFinite(vadEndAt) ? (vadEndAt as number) : undefined,
        at: sttDoneAt,
        turnId: routineTurnId,
      });
      const routineKey =
        (await getUserKeyOrNull(userId, "anthropic")) ?? process.env.ANTHROPIC_API_KEY ?? "";
      const routineTimezone = await resolveUserTimezone(userId);
      const runId = fireRoutineOverBus(matched.spec.blocks, {
        userId,
        apiKey: routineKey,
        isVoice: true,
        mode: jarvisMode,
        synthesize: matched.spec.synthesize === true,
        parallel: matched.spec.parallel === true,
        routineName: matched.name,
        loadingInstruction: matched.spec.loadingInstruction?.trim() || undefined,
        timezone: routineTimezone,
        echoTurnId: routineTurnId,
      });
      return Response.json(
        { transcript, sttDoneAt, routine: matched.id, runId, turnId: routineTurnId },
        { headers: CORS },
      );
    }
  } catch (err) {
    console.error("[voice/transcript] utterance routine check failed", err);
  }

  // Mint the reply turnId BEFORE the user-echo emit and stamp it on the echo, so
  // the desktop reducer pairs the user bubble to THIS turn's reply by identity.
  // Under overlap with a routine-interception turn (whose response-start fires
  // late, fire-and-forget), pure arrival-order FIFO could otherwise attach the
  // wrong reply to this user row.
  const turnId = crypto.randomUUID();
  emitPhysicalTranscript({
    transcript,
    sttDoneAt,
    vadEndAt: Number.isFinite(vadEndAt) ? (vadEndAt as number) : undefined,
    at: sttDoneAt,
    turnId,
  });

  const userTurnId = crypto.randomUUID();
  const userTurnCreatedAt = new Date();
  const assistantTurnCreatedAt = new Date(userTurnCreatedAt.getTime() + 1);

  // Conversation memory: load the recent-turn window BEFORE persisting the
  // current user turn, so the current utterance is never double-counted in the
  // history we thread in. Fail-open — a history-load error must never break the
  // turn; we fall back to the old cold single-turn behavior.
  let recentHistory: Awaited<ReturnType<typeof buildRecentHistory>> = [];
  try {
    recentHistory = await buildRecentHistory(userId);
  } catch (err) {
    console.error("[voice/transcript] buildRecentHistory failed; running without history", err);
    recentHistory = [];
  }

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

  // Real interrupt support for this persistent-SSE path: register an abort
  // controller keyed by turnId so /api/jarvis/voice/cancel can stop the running
  // model turn (not just client-side audio). On abort we emit response-end once
  // so the desktop/browser retire the turn cleanly.
  const turnController = registerTurnAbort(turnId);
  let responseEnded = false;
  const endResponseOnce = (): void => {
    if (responseEnded) return;
    responseEnded = true;
    emitJarvisResponseEnd({ turnId, at: Date.now() });
  };
  turnController.signal.addEventListener("abort", endResponseOnce, { once: true });

  // Accumulate assistant response for DB persistence on completion.
  let assistantText = "";
  const assistantActions: Array<{ toolUseId: string; name: string; result: unknown }> = [];

  // Start the agent turn NOW (before the return), then hand the promise to
  // `after` purely for the Vercel keep-alive property. Starting it before the
  // response makes first-SSE-chunk time independent of dev's flush behavior:
  // `after()` defers scheduling, and `next dev` does not reliably detach the
  // response from the request's pending work, which previously delayed both the
  // echo and the turn start until the whole turn finished. The turn communicates
  // entirely over the separate SSE stream and persists to the DB — it does NOT
  // need the POST response open.
  console.log(`[voice-timing] setup ${Date.now() - sttDoneAt}ms (stt-done → turn start)`);
  const turnPromise = runJarvisTurnStream({
      userId,
      apiKey: anthropicKey,
      input: transcript,
      // Thread the recent conversation window in front of the current turn so
      // pronoun / entity references ("send him a message") resolve. The current
      // user turn is appended last and is the only turn the model must act on.
      messages: [...recentHistory, { role: "user", content: transcript }],
      // Provenance: paired-device token name; the headless ESP32 path has no
      // token identity, so it reads as the physical extender.
      source: { device: desktopIdentity?.deviceName ?? "Physical extender", input: "voice" },
      isVoice: true,
      mode: jarvisMode,
      sttDoneAt,
      vadEndAt: Number.isFinite(vadEndAt) ? (vadEndAt as number) : undefined,
      abortSignal: turnController.signal,
      onTextDelta: (delta) => {
        assistantText += delta;
        emitJarvisResponseChunk({ turnId, delta, at: Date.now() });
      },
      // Spoken tool-latency ack — its own event so it speaks before the answer
      // (same turnId ⇒ the desktop TTS queue serializes it first) without ever
      // landing in `assistantText`, the persisted turn, or the visual bubble.
      onAck: (text) => {
        emitJarvisAck({ turnId, text, at: Date.now() });
      },
      onAction: (toolUseId, name, result) => {
        assistantActions.push({ toolUseId, name, result });
        emitJarvisToolCall({ turnId, toolUseId, name, result, at: Date.now() });
      },
      onDone: () => {
        endResponseOnce();
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
        endResponseOnce();
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

  // Retire the abort registration once the turn settles (done / error / abort),
  // whichever path resolves runJarvisTurnStream.
  void turnPromise.finally(() => unregisterTurnAbort(turnId));

  // Keep the serverless function alive until the turn completes (Vercel drains
  // pending work registered via `after`); does not gate the response.
  after(() => turnPromise);

  return Response.json({ transcript, turnId }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
