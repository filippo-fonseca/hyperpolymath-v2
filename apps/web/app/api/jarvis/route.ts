/**
 * POST /api/jarvis — JARVIS Console SSE Route Handler.
 *
 * Phase 5 Plan 05-02 Task 3.
 *
 * Wires `@hyperpolymath/jarvis-core` to Anthropic Messages API + Drizzle +
 * `@/lib/gcal/events`. Streams Anthropic responses as Server-Sent Events.
 *
 * INVARIANTS:
 *   - Node runtime (Edge cannot host googleapis + postgres-js + drizzle).
 *   - getClaims() for auth — JWT-validating (per CLAUDE.md Critical Pattern 1
 *     forbidding the cookie-only readback path in server code).
 *   - userId is re-derived at the boundary — model never emits userId.
 *   - Per-tool strict: true via jarvis-core's buildToolDefinitions (the
 *     previous structured-outputs beta header is deprecated — research §1.5).
 *   - cache_control on LAST system block + LAST tool (set inside
 *     jarvis-core; we just pass the values through).
 *   - X-Accel-Buffering: no header (Vercel proxy must not buffer SSE).
 *   - AbortController propagation: client cancel → upstream Anthropic cancel.
 *   - Server-side Zod re-validation BEFORE executor dispatch (defense-in-depth
 *     even with strict:true on Anthropic's side).
 *   - Telemetry write via logJarvisEvent (fire-and-forget) after stream end.
 *
 * SSE event shape:
 *   event: text   data: { delta: string }
 *   event: action data: { toolUseId, name, result: ExecutorResult }
 *   event: done   data: { usage: { input_tokens, output_tokens,
 *                                  cache_read_input_tokens,
 *                                  cache_creation_input_tokens } }
 *   event: error  data: { message: string }
 */

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import {
  getAnthropicClient,
  JARVIS_MODEL,
} from "@/lib/jarvis/anthropic-client";
import { createServerExecutor } from "@/lib/jarvis/executor";
import { logJarvisEvent } from "@/lib/jarvis/log-event";
import { validateTurnReferences } from "@/lib/jarvis/validate-references";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  buildToolDefinitions,
  type ProjectSummary,
  zAskClarification,
  zAskClarificationFor,
  zCreateCapture,
  zCreateCaptureFor,
  zCreateEvent,
  zCreateEventFor,
  zCreateTask,
  zCreateTaskFor,
  zRememberFact,
  zRememberFactFor,
} from "@hyperpolymath/jarvis-core";
import { getJarvisFactsForUser } from "@/lib/db/queries/jarvis-facts";

export const runtime = "nodejs";
export const maxDuration = 60; // JARVIS-15 budget; Vercel default 300s gives headroom.

// TOOL_VALIDATORS must match the schema variant SENT to the model, otherwise
// Zod silently strips fields the model included (Phase 7: voice_summary was
// being stripped from voice turns because the non-voice variant didn't know
// about it, leaving receipt.voice_summary undefined and no audio).
// buildToolValidators returns the variant matching voiceActive at request time.
function buildToolValidators(voiceActive: boolean) {
  return {
    create_task: zCreateTaskFor({ voiceActive }),
    create_capture: zCreateCaptureFor({ voiceActive }),
    create_event: zCreateEventFor({ voiceActive }),
    remember_fact: zRememberFactFor({ voiceActive }),
    ask_clarification: zAskClarificationFor({ voiceActive }),
  } as const;
}

type ToolName = keyof ReturnType<typeof buildToolValidators>;

// Touch the non-voice exports so tree-shaking doesn't drop them (they're still
// referenced by test fixtures and by external consumers via index.ts barrel).
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
  history: Array<{ role: "user" | "assistant"; content: string }>;
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
  const startTime = Date.now();
  let firstTokenAt: number | null = null;

  // Phase 9 / TEL-01: per-stage timestamps + turn correlation id.
  //
  //   turnId            — emitted via `event: turn-start` SSE at stream open
  //                       so the client can correlate Plan 09-02's voice-stage
  //                       beacon writes back to this jarvis_events row by id.
  //   firstTokenAt_d    — Date instance backing first_token_at column.
  //                       Distinct from the existing numeric `firstTokenAt`
  //                       which backs the integer first_token_ms column.
  //   lastTokenAt_d     — updated on every text delta; final value reflects
  //                       the last text chunk the model emitted.
  //   toolLoopDoneAt_d  — captured after `await Promise.allSettled(pendingActions)`
  //                       so it reflects the moment the agentic loop is fully drained.
  const turnId = crypto.randomUUID();
  let firstTokenAt_d: Date | null = null;
  let lastTokenAt_d: Date | null = null;
  let toolLoopDoneAt_d: Date | null = null;

  // 1. Auth — re-derive userId at boundary (JARVIS-12)
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claimsResult.data.claims.sub;

  // 2. Voice header (Phase 7 forward-compat; Phase 5 always false)
  const voiceActive = req.headers.get("X-Voice-Active") === "true";

  // Phase 9 / TEL-01: STT-done-at request header round-trip from the client.
  // JarvisListener reads x-jarvis-stt-done-at off the /api/jarvis/stt response,
  // then forwards it as X-Jarvis-Stt-Done-At on the subsequent /api/jarvis POST.
  // Guard: a bogus/non-numeric value coerces to null. Telemetry never breaks user flow.
  const sttDoneAtHeader = req.headers.get("X-Jarvis-Stt-Done-At");
  const sttDoneAt_d: Date | null = sttDoneAtHeader
    ? new Date(Number(sttDoneAtHeader))
    : null;
  const sttDoneAtSafe =
    sttDoneAt_d && !Number.isNaN(sttDoneAt_d.getTime()) ? sttDoneAt_d : null;

  // 3. Request body
  let body: JarvisRequestBody;
  try {
    body = (await req.json()) as JarvisRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // 4. Load user context (projects + tz/default cal + facts in parallel for LAT-04)
  //
  // Phase 10 / LAT-04 (D-05 narrow scope): three independent reads — projects
  // list, user-row (tz + default cal), and facts — are fired concurrently via
  // a single Promise.all so the route-boundary wall-clock collapses from
  // sum-of-three to max-of-three. No other awaits in this handler are touched.
  //
  // Phase 5.1 (D-M4 / JARVIS-18): facts are loaded for whole-blob injection
  // into the cached system prompt. Loaded once per turn at the route boundary.
  // When jarvis_facts changes, the cache key rotates on next turn (D-M4 —
  // one cold-cache turn is acceptable). Returns [] for new users.
  const [userProjects, userRows, userFacts] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, icon: projects.icon })
      .from(projects)
      .where(eq(projects.userId, userId)),
    db
      .select({
        timezone: users.timezone,
        defaultCalendarId: users.gcalDefaultCalendarId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    getJarvisFactsForUser(userId),
  ]);
  const userRow = userRows[0];

  const projectSummaries: ProjectSummary[] = userProjects.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
  }));
  // Cast to JarvisFact[] — DB CHECK constraint guarantees the type/key/value
  // fields are always valid literals. The cast avoids a round-trip re-validation
  // that would cost an extra Zod parse per turn (not worth it for trusted DB reads).
  const system = buildSystemPrompt({
    projects: projectSummaries,
    facts: userFacts as import("@hyperpolymath/jarvis-core").JarvisFact[],
    voiceActive,
  });
  const tools = buildToolDefinitions({ voiceActive });
  const toolValidators = buildToolValidators(voiceActive);

  // 5. Slash-command forcing via tool_choice
  //    /task | /capture | /event → force the matching create_* tool
  //    /ask                       → forbid all tools (text-only meta-question)
  //    /help                      → no override (client renders help locally)
  //    (none + bare meta-question) → treat as /ask automatically
  //    (none)                     → auto-infer
  //
  // Bare meta-question detection: covers the common forms the user is likely
  // to type without the slash. Conservative — declarative captures like
  // "what a day" or "when did you say" don't match. If a sentence matches
  // any of these patterns, we route through the same forbidden-tool path as
  // an explicit /ask so the model emits prose deterministically.
  const META_QUESTION_RE =
    /^(what\s+(?:did|do|does|are|is|was|were|have|will)|did\s+(?:i|we|you)|do\s+(?:i|we|you)|have\s+(?:i|we|you)|show\s+me|tell\s+me|list\s+|summari[sz]e|recap|how\s+many|how\s+much)\b/i;
  const bareMetaQuestion =
    !body.slashCommand && META_QUESTION_RE.test(body.input.trim());
  const askMode = body.slashCommand === "ask" || bareMetaQuestion;
  const toolChoice = askMode
    ? ({ type: "none" as const })
    : body.slashCommand && body.slashCommand !== "help"
      ? ({ type: "tool" as const, name: `create_${body.slashCommand}` })
      : ({ type: "auto" as const });

  // 6. Build user message — append pre-parsed dates + linked-references hints
  //    Phase 5.1 (D-A2 / Pitfall 2): detect [CLARIFICATION REPLY] prefix for depth cap.
  //    When present, append a system note forbidding another ask_clarification this turn.
  const isClarificationReply = body.input.trimStart().startsWith("[CLARIFICATION REPLY]");
  let userContent = body.input;
  if (body.parsedDates && body.parsedDates.length > 0) {
    // MANDATORY hint: model MUST copy these ISO strings verbatim into due/start/end.
    // For entries with allDay=true, the user did NOT specify a time — the
    // task's due is date-only (do not invent a time-of-day).
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
  // Phase 5.1 (D-A2 / Pitfall 2): depth cap. When user reply contains [CLARIFICATION REPLY],
  // append a system note so the model does NOT emit ask_clarification again this turn.
  // The model sees this as the user's answer and must proceed to action or capture-first.
  if (isClarificationReply) {
    userContent += `\n\n[INTERNAL: This message is a reply to your previous ask_clarification. Do NOT emit another ask_clarification this turn — execute the action now using the user's clarification, or fall back to capture-first if still ambiguous. Depth cap enforced (Pitfall 2).]`;
  }
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...body.history,
    { role: "user", content: userContent },
  ];

  // 7. Pre-validate all project references for this turn (D-P2 #3 / JARVIS-21).
  //    Only fires when the client linked one or more project IDs. Empty turns
  //    skip this step entirely (no extra DB query for zero-reference turns).
  //    The validated project IDs flow into ctx.preValidatedProjectIds so
  //    multi-action turns referencing the same project short-circuit executor
  //    validation without re-querying (see resolveProjectIds in executor.ts).
  const linkedProjectIds = body.linkedProjectIds ?? [];
  let preValidatedProjectIds = new Set<string>();
  if (linkedProjectIds.length > 0) {
    const turnRefs = await validateTurnReferences(userId, linkedProjectIds, null);
    preValidatedProjectIds = new Set(turnRefs.projects.ids);
  }

  // 8. AbortController propagation: client req.signal → upstream signal
  const upstream = new AbortController();
  const onAbort = () => upstream.abort();
  req.signal.addEventListener("abort", onAbort, { once: true });

  // 9. Build SSE stream
  const encoder = new TextEncoder();
  const actionTypes: string[] = [];
  let anyTextEmitted = false;
  const executor = createServerExecutor();
  const ctx = {
    userId,
    userTimezone: userRow?.timezone ?? "America/New_York",
    defaultCalendarId: userRow?.defaultCalendarId ?? null,
    // Phase 5.1 D-P2 #3: pre-validated project IDs from the turn boundary.
    // Executors consume this set to short-circuit their own validation when
    // the model-emitted project_ids are a subset of the pre-validated set.
    preValidatedProjectIds,
  };

  // Track all async executor work spawned from contentBlock events so we can
  // await it BEFORE closing the stream. The Anthropic SDK fires events
  // synchronously and does NOT await async listener returns — without this
  // explicit barrier, finalMessage() resolves before slower executors finish,
  // dropping their SSE "action" emits on the floor (race observed for
  // multi-tool messages and any executor that throws).
  const pendingActions: Promise<void>[] = [];

  // Build a quick lookup from chrono-parsed dates so the server can attach an
  // authoritative allDay flag to each receipt's `due`/`start`/`end` ISO. The
  // receipt component then renders date-only vs date+time deterministically
  // (no fragile midnight/noon heuristic).
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

  // Phase 9 / TEL-01: capture promptBuiltAt IMMEDIATELY before opening the
  // ReadableStream. This is the moment "prompt assembly is done, we're about
  // to talk to Anthropic" — the natural anchor for downstream stage deltas.
  const promptBuiltAt_d = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      // Phase 9 / TEL-01 (CRITICAL ORDERING): emit `turn-start` as the FIRST
      // SSE event so the client binds activeTurnId before any LLM events. The
      // enqueue MUST run BEFORE `anth.messages.stream(...)` — otherwise a fast
      // Anthropic response could enqueue contentBlock first and the client
      // would see the LLM event before the turn-start handshake.
      controller.enqueue(encoder.encode(sse("turn-start", { turnId })));

      const anth = getAnthropicClient();
      // Anthropic SDK 0.96: messages.stream() returns an EventEmitter-like
      // helper with .on("contentBlock"|"text", cb) + .finalMessage(). The
      // signal option propagates AbortController to the underlying HTTP call.
      const anthStream = anth.messages.stream(
        {
          model: JARVIS_MODEL,
          max_tokens: 1024,
          system: system as unknown as never, // Anthropic types accept array-of-blocks at runtime
          tools: tools as unknown as never,
          tool_choice: toolChoice as unknown as never,
          messages: messages as unknown as never,
        },
        { signal: upstream.signal },
      );

      anthStream.on("contentBlock", (block: unknown) => {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now() - startTime;
          firstTokenAt_d = new Date();
        }
        const b = block as {
          type: string;
          id?: string;
          name?: string;
          input?: unknown;
        };
        if (b.type !== "tool_use") return;

        // Phase 5.1 D-P3: emit "queued" placeholder BEFORE the executor runs.
        // The client pre-renders a JarvisReceipt in queued/pulse state so the
        // user sees something immediately, then the "action" event upgrades it.
        controller.enqueue(encoder.encode(sse("queued", { toolUseId: b.id, name: b.name })));

        // CRITICAL: wrap the async executor work in a tracked promise. The
        // Anthropic SDK fires `contentBlock` synchronously and ignores the
        // returned promise — without this barrier the second tool_use's
        // executor result lands AFTER controller.close() and is lost.
        const work = (async () => {
          try {
            const validator = toolValidators[b.name as ToolName];
            if (!validator) {
              controller.enqueue(
                encoder.encode(
                  sse("error", { message: `Unknown tool: ${b.name ?? "?"}` }),
                ),
              );
              return;
            }
            const parsed = validator.safeParse(b.input);
            if (!parsed.success) {
              controller.enqueue(
                encoder.encode(
                  sse("error", {
                    message: `Tool validation failed: ${parsed.error.message}`,
                  }),
                ),
              );
              return;
            }

            actionTypes.push(b.name as string);
            let result;
            if (b.name === "create_task") {
              // Deterministic priority override — when the user typed an
              // explicit priority token, bind the value here rather than
              // relying on the model honoring the soft directive. Eliminates
              // the "first send defaults to P3" class of bugs entirely.
              const taskData = {
                ...(parsed.data as Parameters<typeof executor.createTask>[0]),
              };
              if (body.parsedPriority) {
                (taskData as { priority?: string }).priority =
                  body.parsedPriority;
              }
              result = await executor.createTask(
                taskData as Parameters<typeof executor.createTask>[0],
                ctx,
              );
            } else if (b.name === "create_capture") {
              result = await executor.createCapture(
                parsed.data as Parameters<typeof executor.createCapture>[0],
                ctx,
              );
            } else if (b.name === "create_event") {
              result = await executor.createEvent(
                parsed.data as Parameters<typeof executor.createEvent>[0],
                ctx,
              );
            } else if (b.name === "remember_fact") {
              // Phase 5.1 (D-M5 / JARVIS-18): persist a user fact.
              // TOOL_VALIDATORS already validated the shape; executor handles
              // the onConflictDoUpdate upsert + returns factId in receipt so
              // the jarvis_suggested Keep/Discard path can hard-delete.
              result = await executor.rememberFact(
                parsed.data as Parameters<typeof executor.rememberFact>[0],
                ctx,
              );
            } else if (b.name === "ask_clarification") {
              // Phase 5.1 (D-A1 / JARVIS-19): clarifying question — no DB write.
              // First, emit a dedicated SSE event so the client can render the
              // inline question receipt BEFORE the executor responds. The executor
              // is a no-op that returns an ok receipt for uniform dispatch handling.
              const cdata = parsed.data as {
                question: string;
                options?: string[];
                suggested_action?: { tool: string };
              };
              controller.enqueue(
                encoder.encode(
                  sse("clarification", {
                    toolUseId: b.id,
                    question: cdata.question,
                    options: cdata.options ?? [],
                    suggestedAction: cdata.suggested_action ?? null,
                  }),
                ),
              );
              result = await executor.askClarification(
                parsed.data as Parameters<typeof executor.askClarification>[0],
                ctx,
              );
            } else {
              return;
            }

            // Attach authoritative allDay flag to the receipt so the client
            // never has to guess from wall-clock midnight/noon heuristics.
            if (
              result &&
              (result as { ok?: boolean }).ok === true &&
              (result as { receipt?: Record<string, unknown> }).receipt
            ) {
              const r = (result as { receipt: Record<string, unknown> })
                .receipt;
              if (b.name === "create_task" && typeof r.due === "string") {
                r.allDay = isAllDayIso(r.due);
              } else if (b.name === "create_event") {
                if (typeof r.start === "string") {
                  r.allDay = isAllDayIso(r.start);
                }
              }
            }

            controller.enqueue(
              encoder.encode(
                sse("action", { toolUseId: b.id, name: b.name, result }),
              ),
            );
          } catch (err) {
            // Defense-in-depth: never let an executor throw silently lose
            // the receipt — surface an SSE error so the UI can react.
            const message =
              err instanceof Error ? err.message : String(err);
            controller.enqueue(
              encoder.encode(
                sse("error", {
                  message: `Executor failed for ${b.name ?? "?"}: ${message}`,
                }),
              ),
            );
          }
        })();
        pendingActions.push(work);
      });

      anthStream.on("text", (delta: unknown) => {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now() - startTime;
          firstTokenAt_d = new Date();
        }
        // Phase 9 / TEL-01: refresh lastTokenAt on every delta — final value
        // reflects the last text chunk emitted by the model.
        lastTokenAt_d = new Date();
        const s = String(delta);
        if (s.trim().length > 0) anyTextEmitted = true;
        controller.enqueue(encoder.encode(sse("text", { delta: s })));
      });

      try {
        const final = await anthStream.finalMessage();
        // Drain all in-flight executor work BEFORE closing the SSE stream.
        // finalMessage() resolves as soon as Anthropic finishes sending — but
        // our executors (DB inserts, gcal calls) may still be running.
        await Promise.allSettled(pendingActions);
        // Phase 9 / TEL-01: agentic loop fully drained — anchor for tool-loop
        // duration metrics. Captured AFTER allSettled so it reflects the true
        // "executors done" moment, not just "model done emitting".
        toolLoopDoneAt_d = new Date();

        // Inspect final.content authoritatively rather than trusting stream
        // event accounting alone — covers any race where text deltas arrive
        // after we stopped tracking. Stream a text replay if the model DID
        // emit a text block but stream-event accounting missed it.
        const finalContent = (final?.content ?? []) as Array<{
          type?: string;
          text?: string;
        }>;
        const finalTextBlocks = finalContent
          .filter(
            (b) =>
              b.type === "text" &&
              typeof b.text === "string" &&
              b.text.trim().length > 0,
          )
          .map((b) => b.text as string);
        if (!anyTextEmitted && finalTextBlocks.length > 0) {
          controller.enqueue(
            encoder.encode(sse("text", { delta: finalTextBlocks.join("\n") })),
          );
          anyTextEmitted = true;
        }

        // Empty-response fallback: if the model emitted neither text nor any
        // successful action, synthesize a short prose reply so the user
        // doesn't see the thinking-word vanish into silence. Most commonly
        // hit on /ask + bare meta-question paths where the model's policy
        // gets confused.
        if (!anyTextEmitted && actionTypes.length === 0) {
          const fallback = askMode
            ? "I'm afraid I haven't enough context to answer that, sir."
            : "I didn't quite catch that, sir — try rephrasing as a thing to file, or use /ask to query history.";
          controller.enqueue(
            encoder.encode(sse("text", { delta: fallback })),
          );
        }

        // Dev-mode diagnostics — surface to server logs so we can see what
        // the model actually emitted on perplexing turns.
        if (process.env.NODE_ENV !== "production") {
          const stopReason = (final as { stop_reason?: string } | undefined)
            ?.stop_reason;
          const blockTypes = finalContent
            .map((b) => b.type ?? "?")
            .join(",");
          // eslint-disable-next-line no-console
          console.log(
            `[jarvis] askMode=${askMode} stop=${stopReason} text=${anyTextEmitted} actions=${actionTypes.length} blocks=${blockTypes}`,
          );
        }

        controller.enqueue(
          encoder.encode(sse("done", { usage: final.usage })),
        );

        // Fire-and-forget telemetry — never await from request thread.
        // Phase 9 / TEL-01: pin `id` to turnId so Plan 09-02's beacon endpoint
        // can UPDATE WHERE id = $turnId to attach vad/tts/audio timestamps.
        // The stages block carries the 5 server-captured timestamps; voice-
        // only fields (vadEndAt, ttsFirstByteAt, audioFirstPlayAt) remain null
        // here and land via the beacon post-hoc.
        void logJarvisEvent({
          id: turnId,
          userId,
          promptText: body.input,
          preParsedDates: body.parsedDates ?? null,
          slashCommandMode: body.slashCommand ?? null,
          voiceActive,
          actionTypes,
          usage: final.usage as JarvisEventUsage,
          latencyMs: Date.now() - startTime,
          firstTokenMs: firstTokenAt ?? undefined,
          stages: {
            sttDoneAt: sttDoneAtSafe,
            promptBuiltAt: promptBuiltAt_d,
            firstTokenAt: firstTokenAt_d,
            lastTokenAt: lastTokenAt_d,
            toolLoopDoneAt: toolLoopDoneAt_d,
            // vadEndAt, ttsFirstByteAt, audioFirstPlayAt remain null here —
            // Plan 09-02's beacon endpoint UPDATEs them by turn_id post-hoc.
          },
        });
      } catch (err) {
        const errName = (err as { name?: string })?.name;
        // AbortError is a normal client disconnect — swallow it.
        if (errName !== "AbortError") {
          const message =
            (err as { message?: string })?.message ?? String(err);
          controller.enqueue(encoder.encode(sse("error", { message })));
          // Phase 9 / TEL-01: pass partial stages on the error path too.
          // toolLoopDoneAt is intentionally absent here (the loop didn't
          // complete); promptBuiltAt is always set since we always reach
          // the stream open; firstTokenAt/lastTokenAt may be null if the
          // model failed before emitting the first token.
          void logJarvisEvent({
            id: turnId,
            userId,
            promptText: body.input,
            voiceActive,
            actionTypes,
            latencyMs: Date.now() - startTime,
            firstTokenMs: firstTokenAt ?? undefined,
            error: message,
            stages: {
              sttDoneAt: sttDoneAtSafe,
              promptBuiltAt: promptBuiltAt_d,
              firstTokenAt: firstTokenAt_d,
              lastTokenAt: lastTokenAt_d,
            },
          });
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        controller.close();
      }
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

// Anthropic 0.96 usage typing varies between non-streaming + streaming final
// message; this captures the union shape we forward to telemetry.
interface JarvisEventUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
