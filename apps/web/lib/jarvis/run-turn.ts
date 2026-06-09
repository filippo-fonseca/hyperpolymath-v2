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

export interface RunTurnUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface RunTurnOptions {
  userId: string;
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
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
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
  } as const;
}

type ToolName = keyof ReturnType<typeof buildToolValidators>;

function formatTodayDateUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const todayDate = formatTodayDateUtc();
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
    userTimezone: userRow?.timezone ?? "America/New_York",
    defaultCalendarId: userRow?.defaultCalendarId ?? null,
    preValidatedProjectIds,
  };

  const pendingActions: Promise<void>[] = [];
  const promptBuiltAt_d = new Date();

  const sttDoneAt_d: Date | null = opts.sttDoneAt
    ? new Date(opts.sttDoneAt)
    : null;
  const sttDoneAtSafe =
    sttDoneAt_d && !Number.isNaN(sttDoneAt_d.getTime()) ? sttDoneAt_d : null;

  const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> =
    opts.messages ?? [{ role: "user", content: opts.input }];

  const toolChoice = opts.toolChoice ?? { type: "auto" as const };

  const anth = getAnthropicClient();
  const anthStream = anth.messages.stream(
    {
      model: JARVIS_MODEL,
      max_tokens: 1024,
      system: system as unknown as never,
      tools: tools as unknown as never,
      tool_choice: toolChoice as unknown as never,
      messages: anthropicMessages as unknown as never,
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
        let result;
        if (b.name === "create_task") {
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
          result = await executor.rememberFact(
            parsed.data as Parameters<typeof executor.rememberFact>[0],
            ctx,
          );
        } else if (b.name === "ask_clarification") {
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
        } else {
          return;
        }

        opts.onAction(b.id ?? "", b.name as string, result);
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

  try {
    const final = await anthStream.finalMessage();
    await Promise.allSettled(pendingActions);
    toolLoopDoneAt_d = new Date();

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
      opts.onTextDelta(finalTextBlocks.join("\n"));
      anyTextEmitted = true;
    }

    if (!anyTextEmitted && actionTypes.length === 0) {
      opts.onTextDelta("I didn't quite catch that, sir — try rephrasing as a thing to file.");
    }

    const usage = final.usage as RunTurnUsage;
    opts.onDone(usage);

    void logJarvisEvent({
      id: turnId,
      userId: opts.userId,
      promptText: opts.input,
      voiceActive: opts.isVoice,
      actionTypes,
      usage: usage as {
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
