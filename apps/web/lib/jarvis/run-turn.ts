import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { areas, captures, projects, tasks, users } from "@/lib/db/schema";
import {
  getAnthropicClient,
  JARVIS_MODEL,
} from "@/lib/jarvis/anthropic-client";
import { createServerExecutor } from "@/lib/jarvis/executor";
import { logJarvisEvent } from "@/lib/jarvis/log-event";
import type { SnapshotInputs } from "@/lib/jarvis/render-user-state";
import * as stateCache from "@/lib/jarvis/state-snapshot-cache";
import { validateTurnReferences } from "@/lib/jarvis/validate-references";
import {
  buildSystemPrompt,
  buildToolDefinitions,
  type ProjectSummary,
  zAskClarificationFor,
  zCreateCaptureFor,
  zCreateEventFor,
  zCreateTaskFor,
  zRememberFactFor,
} from "@hyperpolymath/jarvis-core";
import { getJarvisFactsForUser } from "@/lib/db/queries/jarvis-facts";
import { extractAndPersistFacts } from "@/lib/jarvis/extract-facts";
import {
  buildSessionEntitiesBlock,
  reconstructSessionEntitiesFromHistory,
  entityFromToolResult,
} from "@/lib/jarvis/session-entities";
import type { SessionEntity, JarvisToolName } from "@hyperpolymath/jarvis-core";
// Phase 16 tool validators (via tools subpath export from jarvis-core)
import {
  UpdateTaskInputSchema,
  DeleteTaskInputSchema,
  UpdateCaptureInputSchema,
  DeleteCaptureInputSchema,
  UpdateEventInputSchema,
  DeleteEventInputSchema,
  FindTasksInputSchema,
  FindCapturesInputSchema,
  FindEventsInputSchema,
  // Phase D — people tools
  CreatePersonInputSchema,
  FindPeopleInputSchema,
  LinkPeopleInputSchema,
} from "@hyperpolymath/jarvis-core/tools";

export interface RunTurnUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface RunTurnOptions {
  userId: string;
  /**
   * BYOK Anthropic key for THIS turn. The caller resolves it (per-user via
   * lib/byok/keys.ts, or owner env for owner-system paths) and passes it in —
   * run-turn never reads the environment or resolves a key itself.
   */
  apiKey: string;
  /**
   * Pre-generated turnId. When provided, used for both telemetry (logJarvisEvent id)
   * and the voice path's response-start event. When absent, the helper generates one.
   * The browser route passes the same turnId it emits in the `turn-start` SSE event
   * so Plan 09-02's beacon can correlate by id.
   */
  turnId?: string;
  /**
   * The user's text for this turn (used for telemetry). For voice-originated
   * turns (no browser session), this becomes the single user message. For
   * browser turns with history, pass `messages` instead.
   */
  input: string;
  /**
   * Full message array (history + current user message). When provided,
   * this is sent directly to Anthropic — use this for browser turns that
   * carry conversation history. For voice-originated turns with no history,
   * omit and let the helper build `[{role:"user", content:input}]`.
   */
  // Phase 16: widened to accept content-block arrays (tool_use / tool_result)
  // for multi-turn agentic sessions. String content remains valid.
  messages?: Array<{
    role: "user" | "assistant";
    content: string | Array<{ type: "text" | "tool_use" | "tool_result"; [key: string]: unknown }>;
  }>;
  /**
   * Anthropic tool_choice override. Defaults to `{type:"auto"}`. Browser
   * route passes slash-command forcing when needed.
   */
  toolChoice?: { type: "auto" } | { type: "none" } | { type: "tool"; name: string };
  /**
   * Explicit priority override (from client-parsed priority token).
   * When set, create_task results will have their priority hard-set to this
   * value regardless of what the model emitted.
   */
  parsedPriority?: "P∞" | "P1" | "P2" | "P3";
  isVoice: boolean;
  /**
   * Capture provenance: paired-device token name ('Web' for browser) +
   * input modality. Denormalized into rows created by the executor.
   */
  source?: { device: string; input: "voice" | "text" };
  sttDoneAt: number | null;
  vadEndAt: number | undefined;
  abortSignal?: AbortSignal;
  onTextDelta: (delta: string) => void;
  /**
   * Called when a tool_use block begins (before executor runs). Optional —
   * browser route uses this to emit a `queued` SSE placeholder.
   */
  onQueued?: (toolUseId: string, name: string) => void;
  /**
   * Called when an ask_clarification tool fires. Optional — browser route
   * uses this to emit a `clarification` SSE event.
   */
  onClarification?: (toolUseId: string, question: string, options: string[], suggestedAction: unknown) => void;
  onAction: (toolUseId: string, name: string, result: unknown) => void;
  onDone: (usage: RunTurnUsage) => void;
  onError: (message: string) => void;
}

function buildToolValidators(voiceActive: boolean) {
  return {
    create_task: zCreateTaskFor({ voiceActive }),
    create_capture: zCreateCaptureFor({ voiceActive }),
    create_event: zCreateEventFor({ voiceActive }),
    remember_fact: zRememberFactFor({ voiceActive }),
    ask_clarification: zAskClarificationFor({ voiceActive }),
    // Phase 16: CRUD + find validators
    update_task: UpdateTaskInputSchema,
    delete_task: DeleteTaskInputSchema,
    update_capture: UpdateCaptureInputSchema,
    delete_capture: DeleteCaptureInputSchema,
    update_event: UpdateEventInputSchema,
    delete_event: DeleteEventInputSchema,
    find_tasks: FindTasksInputSchema,
    find_captures: FindCapturesInputSchema,
    find_events: FindEventsInputSchema,
    // Phase D — people tools
    create_person: CreatePersonInputSchema,
    find_people: FindPeopleInputSchema,
    link_people: LinkPeopleInputSchema,
  } as const;
}

type ToolName = keyof ReturnType<typeof buildToolValidators>;

// en-CA renders Date as YYYY-MM-DD natively — same shape downstream consumers
// (render-user-state, project-startDate compare) expect.
function formatTodayDateInTimezone(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Uncached temporal-context block (appended after all cache breakpoints, like
// the session-entities scratchpad). Without this the model has no idea what
// time it is locally and guesses UTC offsets — "tonight 11pm" landed on the
// next calendar day.
function buildTemporalContextBlock(tz: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
    timeZoneName: "longOffset",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const offset = get("timeZoneName").replace("GMT", "") || "+00:00";
  const local = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  return [
    "CURRENT USER TIME:",
    `- Local now: ${local} (${get("weekday")})`,
    `- Timezone: ${tz} (UTC${offset})`,
    `- When emitting due/start/end timestamps, ALWAYS use this UTC offset (e.g. ${local}:00${offset}) — never a bare Z/UTC timestamp. "tonight", "today", "tomorrow" are relative to the local time above.`,
  ].join("\n");
}

export async function runJarvisTurnStream(opts: RunTurnOptions): Promise<void> {
  const startTime = Date.now();
  const turnId = opts.turnId ?? crypto.randomUUID();
  // Tool schema voiceActive is always false for the shared helper — voice_summary
  // is a browser-TTS concern and server-side voice turns don't need it.
  // opts.isVoice is used only for telemetry (logJarvisEvent.voiceActive).
  const voiceActive = false;

  const [
    userProjects,
    userRows,
    userFacts,
    areasRows,
    recentCapturesRows,
    activeTasksRows,
  ] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        icon: projects.icon,
        areaId: projects.areaId,
        startDate: projects.startDate,
        archivedAt: projects.archivedAt,
      })
      .from(projects)
      .where(eq(projects.userId, opts.userId)),
    db
      .select({
        timezone: users.timezone,
        defaultCalendarId: users.gcalDefaultCalendarId,
        stateVersion: users.stateVersion,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1),
    getJarvisFactsForUser(opts.userId),
    db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(eq(areas.userId, opts.userId)),
    db
      .select({
        id: captures.id,
        createdAt: captures.createdAt,
        content: captures.content,
      })
      .from(captures)
      .where(eq(captures.userId, opts.userId))
      .orderBy(desc(captures.createdAt))
      .limit(50),
    db
      .select({
        id: tasks.id,
        status: tasks.status,
        dueDate: tasks.dueDate,
        title: tasks.title,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, opts.userId), ne(tasks.status, "lesno")))
      .orderBy(asc(tasks.dueDate))
      .limit(10),
  ]);

  const userRow = userRows[0];

  const projectSummaries: ProjectSummary[] = userProjects.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
  }));

  const system = buildSystemPrompt({
    projects: projectSummaries,
    facts: userFacts as import("@hyperpolymath/jarvis-core").JarvisFact[],
    voiceActive,
    userDisplayName: userRow?.displayName ?? null,
  });

  const stateVersion = userRow?.stateVersion ?? 1n;
  const todayDate = formatTodayDateInTimezone(
    userRow?.timezone ?? "America/New_York",
  );
  const activeProjectsForSnapshot: SnapshotInputs["projectsActive"] = [];
  const upcomingProjectsForSnapshot: SnapshotInputs["projectsUpcoming"] = [];
  for (const p of userProjects) {
    if (p.archivedAt) continue;
    const item = { id: p.id, name: p.name, areaId: p.areaId };
    if (p.startDate && p.startDate > todayDate) {
      upcomingProjectsForSnapshot.push(item);
    } else {
      activeProjectsForSnapshot.push(item);
    }
  }

  const snapshotInputs: SnapshotInputs = {
    areas: areasRows.map((a) => ({ id: a.id, name: a.name })),
    projectsActive: activeProjectsForSnapshot,
    projectsUpcoming: upcomingProjectsForSnapshot,
    recentCaptures: recentCapturesRows.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      content: c.content,
    })),
    todayCalendar: [],
    todayDate,
    activeTasks: activeTasksRows.map((t) => ({
      id: t.id,
      status: t.status,
      dueAt: t.dueDate ? new Date(t.dueDate) : null,
      title: t.title,
      projectId: null,
    })),
  };

  const snapshotString = stateCache.getOrBuild(opts.userId, stateVersion, snapshotInputs);
  system.push({
    type: "text",
    text: snapshotString,
    cache_control: { type: "ephemeral" },
  });

  const tools = buildToolDefinitions({ voiceActive });
  const toolValidators = buildToolValidators(voiceActive);

  const preValidatedProjectIds = new Set<string>();
  void validateTurnReferences;

  const upstream = new AbortController();
  if (opts.abortSignal) {
    opts.abortSignal.addEventListener("abort", () => upstream.abort(), { once: true });
  }

  const actionTypes: string[] = [];
  let anyTextEmitted = false;
  let firstTokenAt: number | null = null;
  let firstTokenAt_d: Date | null = null;
  let lastTokenAt_d: Date | null = null;
  let toolLoopDoneAt_d: Date | null = null;

  const executor = createServerExecutor();
  const ctx = {
    userId: opts.userId,
    source: opts.source,
    userTimezone: userRow?.timezone ?? "America/New_York",
    defaultCalendarId: userRow?.defaultCalendarId ?? null,
    preValidatedProjectIds,
  };

  const promptBuiltAt_d = new Date();

  const sttDoneAt_d: Date | null = opts.sttDoneAt
    ? new Date(opts.sttDoneAt)
    : null;
  const sttDoneAtSafe =
    sttDoneAt_d && !Number.isNaN(sttDoneAt_d.getTime()) ? sttDoneAt_d : null;

  // Phase 16: widened to accept content-block arrays alongside string content.
  const anthropicMessages: Array<{
    role: "user" | "assistant";
    content: string | Array<{ type: "text" | "tool_use" | "tool_result"; [key: string]: unknown }>;
  }> = opts.messages ?? [{ role: "user", content: opts.input }];

  const toolChoice = opts.toolChoice ?? { type: "auto" as const };

  const anth = getAnthropicClient(opts.apiKey);

  // ---------------------------------------------------------------------------
  // Phase 16 — Multi-pass agentic loop
  //
  // The model may call find_tasks/find_captures/find_events and then in the
  // same user turn call update_*/delete_* on the discovered items. This loop
  // runs up to LOOP_CAP passes, feeding tool_results back each time the model
  // stops with stop_reason="tool_use".
  //
  // Pitfalls observed (from RESEARCH.md):
  //   Pitfall 1 — tool_result content MUST be serialized to a string (JSON.stringify)
  //   Pitfall 2 — do NOT call buildHistory() inside the loop; loopMessages starts
  //               from anthropicMessages (already includes history)
  //   Pitfall 3 — session-entities scratchpad MUST have NO cache_control
  //   Anti-pattern — do NOT force tool_choice on inner passes; let model decide end_turn
  // ---------------------------------------------------------------------------

  const LOOP_CAP = 5;
  const loopMessages: typeof anthropicMessages = [...anthropicMessages];

  // Prime session-entities scratchpad from prior-turn history so the model
  // can reference entities created in earlier turns without a find call.
  const sessionEntities: SessionEntity[] = reconstructSessionEntitiesFromHistory(anthropicMessages);

  const totalUsage: RunTurnUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  try {
    let passCount = 0;

    while (passCount < LOOP_CAP) {
      passCount++;

      // Re-build system per pass to inject the (mutating) session-entities scratchpad
      // AFTER the snapshot block. Do NOT add cache_control here — Pitfall 3.
      // The temporal-context block is also uncached (changes every minute).
      const scratchpadText = buildSessionEntitiesBlock(sessionEntities);
      const temporalText = buildTemporalContextBlock(
        userRow?.timezone ?? "America/New_York",
      );
      const passSystem = [
        ...system,
        { type: "text" as const, text: temporalText },
        ...(scratchpadText ? [{ type: "text" as const, text: scratchpadText }] : []),
      ];

      const pendingActions: Promise<void>[] = [];
      const toolResultsThisPass: {
        id: string;
        name: JarvisToolName;
        input: Record<string, unknown>;
        result: unknown;
      }[] = [];

      const anthStream = anth.messages.stream(
        {
          model: JARVIS_MODEL,
          max_tokens: 1024,
          system: passSystem as unknown as never,
          tools: tools as unknown as never,
          // tool_choice: only forced on pass 1; subsequent passes let the model
          // choose end_turn vs more tools — anti-pattern prevention.
          tool_choice: (passCount === 1 ? toolChoice : { type: "auto" as const }) as unknown as never,
          messages: loopMessages as unknown as never,
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

        if (opts.onQueued) {
          opts.onQueued(b.id ?? "", b.name ?? "");
        }

        const work = (async () => {
          try {
            const validator = toolValidators[b.name as ToolName];
            if (!validator) {
              opts.onError(`Unknown tool: ${b.name ?? "?"}`);
              return;
            }
            const parsed = validator.safeParse(b.input);
            if (!parsed.success) {
              opts.onError(`Tool validation failed: ${parsed.error.message}`);
              return;
            }

            actionTypes.push(b.name as string);
            const toolName = b.name as JarvisToolName;
            const toolInput = parsed.data as Record<string, unknown>;
            let result;

            if (toolName === "create_task") {
              const taskData = {
                ...(parsed.data as Parameters<typeof executor.createTask>[0]),
              };
              if (opts.parsedPriority) {
                (taskData as { priority?: string }).priority = opts.parsedPriority;
              }
              result = await executor.createTask(
                taskData as Parameters<typeof executor.createTask>[0],
                ctx,
              );
            } else if (toolName === "create_capture") {
              result = await executor.createCapture(
                parsed.data as Parameters<typeof executor.createCapture>[0],
                ctx,
              );
            } else if (toolName === "create_event") {
              result = await executor.createEvent(
                parsed.data as Parameters<typeof executor.createEvent>[0],
                ctx,
              );
            } else if (toolName === "remember_fact") {
              result = await executor.rememberFact(
                parsed.data as Parameters<typeof executor.rememberFact>[0],
                ctx,
              );
            } else if (toolName === "ask_clarification") {
              const cdata = parsed.data as {
                question: string;
                options?: string[];
                suggested_action?: { tool: string };
              };
              if (opts.onClarification) {
                opts.onClarification(
                  b.id ?? "",
                  cdata.question,
                  cdata.options ?? [],
                  cdata.suggested_action ?? null,
                );
              }
              result = await executor.askClarification(
                parsed.data as Parameters<typeof executor.askClarification>[0],
                ctx,
              );
            } else if (toolName === "update_task") {
              result = await executor.updateTask(
                parsed.data as Parameters<typeof executor.updateTask>[0],
                ctx,
              );
            } else if (toolName === "delete_task") {
              result = await executor.deleteTask(
                parsed.data as Parameters<typeof executor.deleteTask>[0],
                ctx,
              );
            } else if (toolName === "update_capture") {
              result = await executor.updateCapture(
                parsed.data as Parameters<typeof executor.updateCapture>[0],
                ctx,
              );
            } else if (toolName === "delete_capture") {
              result = await executor.deleteCapture(
                parsed.data as Parameters<typeof executor.deleteCapture>[0],
                ctx,
              );
            } else if (toolName === "update_event") {
              result = await executor.updateEvent(
                parsed.data as Parameters<typeof executor.updateEvent>[0],
                ctx,
              );
            } else if (toolName === "delete_event") {
              result = await executor.deleteEvent(
                parsed.data as Parameters<typeof executor.deleteEvent>[0],
                ctx,
              );
            } else if (toolName === "find_tasks") {
              result = await executor.findTasks(
                parsed.data as Parameters<typeof executor.findTasks>[0],
                ctx,
              );
            } else if (toolName === "find_captures") {
              result = await executor.findCaptures(
                parsed.data as Parameters<typeof executor.findCaptures>[0],
                ctx,
              );
            } else if (toolName === "find_events") {
              result = await executor.findEvents(
                parsed.data as Parameters<typeof executor.findEvents>[0],
                ctx,
              );
            } else if (toolName === "create_person") {
              result = await executor.createPerson(
                parsed.data as Parameters<typeof executor.createPerson>[0],
                ctx,
              );
            } else if (toolName === "find_people") {
              result = await executor.findPeople(
                parsed.data as Parameters<typeof executor.findPeople>[0],
                ctx,
              );
            } else if (toolName === "link_people") {
              result = await executor.linkPeople(
                parsed.data as Parameters<typeof executor.linkPeople>[0],
                ctx,
              );
            } else {
              return;
            }

            // Collect the tool result for the feedback turn
            toolResultsThisPass.push({
              id: b.id ?? "",
              name: toolName,
              input: toolInput,
              result,
            });

            opts.onAction(b.id ?? "", toolName, result);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            opts.onError(`Executor failed for ${b.name ?? "?"}: ${message}`);
          }
        })();
        pendingActions.push(work);
      });

      anthStream.on("text", (delta: unknown) => {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now() - startTime;
          firstTokenAt_d = new Date();
        }
        lastTokenAt_d = new Date();
        const s = String(delta);
        if (s.trim().length > 0) anyTextEmitted = true;
        opts.onTextDelta(s);
      });

      const final = await anthStream.finalMessage();
      await Promise.allSettled(pendingActions);
      toolLoopDoneAt_d = new Date();

      // Sum usage from this pass into the total
      totalUsage.input_tokens += final.usage.input_tokens ?? 0;
      totalUsage.output_tokens += final.usage.output_tokens ?? 0;
      totalUsage.cache_read_input_tokens += (final.usage as RunTurnUsage).cache_read_input_tokens ?? 0;
      totalUsage.cache_creation_input_tokens += (final.usage as RunTurnUsage).cache_creation_input_tokens ?? 0;

      // Append newly-touched entities to session-entities scratchpad
      for (const r of toolResultsThisPass) {
        const entity = entityFromToolResult(
          r.name,
          r.input,
          r.result as { ok: boolean; id?: string; receipt?: Record<string, unknown> },
        );
        if (entity) sessionEntities.push(entity);
      }

      // Exit loop if model chose to stop or no tools were invoked
      if (final.stop_reason !== "tool_use") break;
      if (toolResultsThisPass.length === 0) break; // safety: stop_reason was tool_use but nothing executed

      // Build the feedback turns so the next pass can reference results
      loopMessages.push({ role: "assistant", content: final.content as never });
      loopMessages.push({
        role: "user",
        content: toolResultsThisPass.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.id,
          content: JSON.stringify(r.result),
        })) as never,
      });
    }

    // Emit a fallback text if the model produced neither text nor action
    const finalContent = (loopMessages[loopMessages.length - 1]?.content ?? []) as Array<{
      type?: string;
      text?: string;
    }>;
    const finalTextBlocks = Array.isArray(finalContent)
      ? finalContent
          .filter(
            (b) =>
              b.type === "text" &&
              typeof b.text === "string" &&
              b.text.trim().length > 0,
          )
          .map((b) => b.text as string)
      : [];
    if (!anyTextEmitted && finalTextBlocks.length > 0) {
      opts.onTextDelta(finalTextBlocks.join("\n"));
      anyTextEmitted = true;
    }

    if (!anyTextEmitted && actionTypes.length === 0) {
      opts.onTextDelta("I didn't quite catch that, sir — try rephrasing as a thing to file.");
    }

    opts.onDone(totalUsage);

    // Aggressive fact extraction — fire-and-forget so it never delays the SSE
    // stream closing (onDone already fired). Mines the last few messages of
    // this turn (user utterance + any clarification + the answer) for durable
    // facts and upserts them into jarvis_facts for the next turn's context.
    // Entirely fail-closed inside extractAndPersistFacts; never awaited.
    void extractAndPersistFacts({
      userId: opts.userId,
      recentMessages: loopMessages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content as unknown as string,
      })),
      apiKey: opts.apiKey,
    });

    void logJarvisEvent({
      id: turnId,
      userId: opts.userId,
      promptText: opts.input,
      voiceActive: opts.isVoice,
      actionTypes,
      usage: totalUsage as {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      },
      latencyMs: Date.now() - startTime,
      firstTokenMs: firstTokenAt ?? undefined,
      stages: {
        sttDoneAt: sttDoneAtSafe,
        promptBuiltAt: promptBuiltAt_d,
        firstTokenAt: firstTokenAt_d,
        lastTokenAt: lastTokenAt_d,
        toolLoopDoneAt: toolLoopDoneAt_d,
      },
    });
  } catch (err) {
    const errName = (err as { name?: string })?.name;
    if (errName !== "AbortError") {
      const message = (err as { message?: string })?.message ?? String(err);
      opts.onError(message);

      void logJarvisEvent({
        id: turnId,
        userId: opts.userId,
        promptText: opts.input,
        voiceActive: opts.isVoice,
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
  }
}
