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
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  buildToolDefinitions,
  type ProjectSummary,
  zCreateCapture,
  zCreateEvent,
  zCreateTask,
} from "@hyperpolymath/jarvis-core";

export const runtime = "nodejs";
export const maxDuration = 60; // JARVIS-15 budget; Vercel default 300s gives headroom.

const TOOL_VALIDATORS = {
  create_task: zCreateTask,
  create_capture: zCreateCapture,
  create_event: zCreateEvent,
} as const;

type ToolName = keyof typeof TOOL_VALIDATORS;

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
  slashCommand?: "task" | "capture" | "event" | "help" | null;
  linkedProjectIds?: string[];
  linkedHashtags?: string[];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let firstTokenAt: number | null = null;

  // 1. Auth — re-derive userId at boundary (JARVIS-12)
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claimsResult.data.claims.sub;

  // 2. Voice header (Phase 7 forward-compat; Phase 5 always false)
  const voiceActive = req.headers.get("X-Voice-Active") === "true";

  // 3. Request body
  let body: JarvisRequestBody;
  try {
    body = (await req.json()) as JarvisRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // 4. Load user context (project list for system prompt + tz + default cal)
  const userProjects = await db
    .select({ id: projects.id, name: projects.name, icon: projects.icon })
    .from(projects)
    .where(eq(projects.userId, userId));
  const userRows = await db
    .select({
      timezone: users.timezone,
      defaultCalendarId: users.gcalDefaultCalendarId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userRow = userRows[0];

  const projectSummaries: ProjectSummary[] = userProjects.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
  }));
  const system = buildSystemPrompt({ projects: projectSummaries, voiceActive });
  const tools = buildToolDefinitions({ voiceActive });

  // 5. Slash-command forcing via tool_choice
  const toolChoice =
    body.slashCommand && body.slashCommand !== "help"
      ? ({ type: "tool" as const, name: `create_${body.slashCommand}` })
      : ({ type: "auto" as const });

  // 6. Build user message — append pre-parsed dates + linked-references hints
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
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...body.history,
    { role: "user", content: userContent },
  ];

  // 7. AbortController propagation: client req.signal → upstream signal
  const upstream = new AbortController();
  const onAbort = () => upstream.abort();
  req.signal.addEventListener("abort", onAbort, { once: true });

  // 8. Build SSE stream
  const encoder = new TextEncoder();
  const actionTypes: string[] = [];
  const executor = createServerExecutor();
  const ctx = {
    userId,
    userTimezone: userRow?.timezone ?? "America/New_York",
    defaultCalendarId: userRow?.defaultCalendarId ?? null,
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

  const stream = new ReadableStream({
    async start(controller) {
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
        if (firstTokenAt === null) firstTokenAt = Date.now() - startTime;
        const b = block as {
          type: string;
          id?: string;
          name?: string;
          input?: unknown;
        };
        if (b.type !== "tool_use") return;

        // CRITICAL: wrap the async executor work in a tracked promise. The
        // Anthropic SDK fires `contentBlock` synchronously and ignores the
        // returned promise — without this barrier the second tool_use's
        // executor result lands AFTER controller.close() and is lost.
        const work = (async () => {
          try {
            const validator = TOOL_VALIDATORS[b.name as ToolName];
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
              result = await executor.createTask(
                parsed.data as Parameters<typeof executor.createTask>[0],
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
        if (firstTokenAt === null) firstTokenAt = Date.now() - startTime;
        controller.enqueue(
          encoder.encode(sse("text", { delta: String(delta) })),
        );
      });

      try {
        const final = await anthStream.finalMessage();
        // Drain all in-flight executor work BEFORE closing the SSE stream.
        // finalMessage() resolves as soon as Anthropic finishes sending — but
        // our executors (DB inserts, gcal calls) may still be running.
        await Promise.allSettled(pendingActions);
        controller.enqueue(
          encoder.encode(sse("done", { usage: final.usage })),
        );

        // Fire-and-forget telemetry — never await from request thread.
        void logJarvisEvent({
          userId,
          promptText: body.input,
          preParsedDates: body.parsedDates ?? null,
          slashCommandMode: body.slashCommand ?? null,
          voiceActive,
          actionTypes,
          usage: final.usage as JarvisEventUsage,
          latencyMs: Date.now() - startTime,
          firstTokenMs: firstTokenAt ?? undefined,
        });
      } catch (err) {
        const errName = (err as { name?: string })?.name;
        // AbortError is a normal client disconnect — swallow it.
        if (errName !== "AbortError") {
          const message =
            (err as { message?: string })?.message ?? String(err);
          controller.enqueue(encoder.encode(sse("error", { message })));
          void logJarvisEvent({
            userId,
            promptText: body.input,
            voiceActive,
            actionTypes,
            latencyMs: Date.now() - startTime,
            firstTokenMs: firstTokenAt ?? undefined,
            error: message,
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
