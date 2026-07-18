import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { areas, captures, jarvisPersonalityConfig, projects, tasks, users } from "@/lib/db/schema";
import { getAnthropicClient, JARVIS_MODEL } from "@/lib/jarvis/anthropic-client";
import {
  createServerExecutor,
  executeStudioCloseWidget,
  executeStudioOpenWidget,
  executeStudioSetHandCursor,
} from "@/lib/jarvis/executor";
import {
  STUDIO_WIDGET_TOOL_DEFINITIONS,
  StudioCloseWidgetInputSchema,
  StudioOpenWidgetInputSchema,
  StudioSetHandCursorInputSchema,
  type StudioCloseWidgetInput,
  type StudioOpenWidgetInput,
  type StudioSetHandCursorInput,
} from "@/lib/jarvis/studio-widget-tools";
import { detectStudioBackstop } from "@/lib/jarvis/studio-intent-backstop";
import { ackPhraseForTool } from "@/lib/jarvis/ack-phrases";
import { logJarvisEvent } from "@/lib/jarvis/log-event";
import type { SnapshotInputs } from "@/lib/jarvis/render-user-state";
import * as stateCache from "@/lib/jarvis/state-snapshot-cache";
import { validateTurnReferences } from "@/lib/jarvis/validate-references";
import { stripMarkdownForSpeech } from "@/lib/voice/strip-markdown-for-speech";
import {
  buildSystemPrompt,
  buildToolDefinitions,
  correctLeadingGreeting,
  greetingForTimeOfDay,
  type PersonalityConfig,
  type ProjectSummary,
  type TimeOfDay,
  timeOfDayForHour,
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
import { buildReferencedEntitiesBlock } from "@/lib/jarvis/resolve-references";
import { REFERENCE_GUIDANCE } from "@/lib/jarvis/reference-guidance";
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
  // Computer-control tools
  OpenUrlInputSchema,
  OpenAppInputSchema,
  OpenWorkspaceInputSchema,
  WebSearchInputSchema,
  // Clicky slice — desktop action tools + server-side weather
  SendMessageInputSchema,
  SystemControlInputSchema,
  TypeTextInputSchema,
  PressKeyInputSchema,
  TakeScreenshotInputSchema,
  RunApplescriptInputSchema,
  RunShortcutInputSchema,
  PlayMusicInputSchema,
  GetWeatherInputSchema,
  // Server-side data tools (Gmail read + Guardian news)
  ReadGmailInputSchema,
  GetNewsInputSchema,
  // WhatsApp — server-side read of synced messages
  ReadWhatsappInputSchema,
  // iMessage — server-side read of synced messages
  ReadImessageInputSchema,
  // Computer Use fallback — catch-all agentic desktop loop
  ComputerUseInputSchema,
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
   * Phase 2 (Task 2.1): computer-control steering. When "computer" (set from
   * the desktop's `X-Jarvis-Mode: computer` header), buildSystemPrompt appends
   * the COMPUTER-CONTROL MODE block that biases toward open_url/open_app/
   * web_search + direct answers and away from filing. Absent → browser/mobile
   * behaviour is unchanged.
   */
  mode?: "computer";
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
  onClarification?: (
    toolUseId: string,
    question: string,
    options: string[],
    suggestedAction: unknown
  ) => void;
  onAction: (toolUseId: string, name: string, result: unknown) => void;
  /**
   * Spoken tool-latency acknowledgement. Fired ONCE per turn, the instant the
   * model chooses its first tool with no spoken preamble, so a voice turn never
   * goes silent while a (possibly slow) tool runs. The caller routes it through
   * a DEDICATED channel (desktop `jarvis-ack` bus event / browser `ack` SSE
   * event) so it speaks BEFORE the answer without polluting the persisted
   * transcript or the visual bubble. Only fired on spoken turns (isVoice).
   */
  onAck?: (text: string) => void;
  onDone: (usage: RunTurnUsage) => void;
  onError: (message: string) => void;
}

// Process-lifetime rotation so consecutive tool turns get varied ack lines
// (acceptance: repeated tool turns must not repeat the same canned ack).
let ackRotation = 0;

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
    // Computer-control tools
    open_url: OpenUrlInputSchema,
    open_app: OpenAppInputSchema,
    open_workspace: OpenWorkspaceInputSchema,
    web_search: WebSearchInputSchema,
    // Clicky slice — desktop action tools + server-side weather
    send_message: SendMessageInputSchema,
    system_control: SystemControlInputSchema,
    type_text: TypeTextInputSchema,
    press_key: PressKeyInputSchema,
    take_screenshot: TakeScreenshotInputSchema,
    run_applescript: RunApplescriptInputSchema,
    run_shortcut: RunShortcutInputSchema,
    play_music: PlayMusicInputSchema,
    get_weather: GetWeatherInputSchema,
    studio_open_widget: StudioOpenWidgetInputSchema,
    studio_close_widget: StudioCloseWidgetInputSchema,
    studio_set_hand_cursor: StudioSetHandCursorInputSchema,
    // Server-side data tools (Gmail read + Guardian news)
    read_gmail: ReadGmailInputSchema,
    get_news: GetNewsInputSchema,
    // WhatsApp — server-side read of synced messages
    read_whatsapp: ReadWhatsappInputSchema,
    // iMessage — server-side read of synced messages
    read_imessage: ReadImessageInputSchema,
    // Computer Use fallback — catch-all agentic desktop loop
    computer_use: ComputerUseInputSchema,
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

// Current wall-clock hour (0–23) in the given IANA timezone. Uses hourCycle
// "h23" so midnight is 0 (not the "24" some Intl outputs produce), keeping the
// value safe to feed into timeOfDayForHour.
function currentHourInTimezone(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return Number.isFinite(h) ? ((h % 24) + 24) % 24 : 0;
}

// Uncached temporal-context block (appended after all cache breakpoints, like
// the session-entities scratchpad). Without this the model has no idea what
// time it is locally and guesses UTC offsets — "tonight 11pm" landed on the
// next calendar day.
//
// It also carries the TIME-OF-DAY + GREETING contract (bgsd/time-aware-greeting):
// the model previously greeted "Good morning, sir." at 1:35 PM because it was
// given a bare 24h timestamp with no derived part-of-day and no instruction to
// match its greeting to the clock. We now inject the human-readable clock
// ("1:35 PM"), the derived bucket (morning/afternoon/evening/night), the exact
// greeting phrase, and an explicit instruction so any briefing/opener greets
// correctly. This block is uncached (it changes every minute) so a Date read
// here is safe — unlike the cache-critical prompt-builder.
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

  // Human-readable 12h clock (e.g. "1:35 PM") for the greeting contract.
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  const timeOfDay = timeOfDayForHour(currentHourInTimezone(tz));
  const greeting = greetingForTimeOfDay(timeOfDay);

  return [
    "CURRENT USER TIME:",
    `- Local now: ${local} (${get("weekday")}) — ${clock} local, which is the ${timeOfDay}.`,
    `- Timezone: ${tz} (UTC${offset})`,
    `- When emitting due/start/end timestamps, ALWAYS use this UTC offset (e.g. ${local}:00${offset}) — never a bare Z/UTC timestamp. "tonight", "today", "tomorrow" are relative to the local time above.`,
    `- GREETING: it is currently the ${timeOfDay} (${clock}). Whenever you open with a time-of-day greeting — a briefing, a "daddy's home" welcome, a morning dump, or any greeting opener — it MUST match the local time: say "${greeting}". Never greet with a different part of the day (e.g. never "Good morning" when it is the ${timeOfDay}).`,
  ].join("\n");
}

export async function runJarvisTurnStream(opts: RunTurnOptions): Promise<void> {
  const startTime = Date.now();
  const turnId = opts.turnId ?? crypto.randomUUID();
  // Two DISTINCT flags that used to be conflated:
  //  - `voiceActive` is the TOOL-SCHEMA flag: it gates the browser-only
  //    `voice_summary` field on create_* tools. It stays false for this shared
  //    helper — the desktop/routine path speaks the leading text block, not a
  //    voice_summary, so we must NOT require the field server-side.
  //  - `speakingTurn` is the PROMPT flag: when the turn is spoken aloud, it
  //    injects the load-bearing SPOKEN-OUTPUT CONTRACT (no markdown, interpret
  //    don't recite, one closing question). Previously dead code — isVoice was
  //    only ever used for telemetry, so the contract never fired on ANY
  //    server-driven voice turn or routine block.
  const voiceActive = false;
  const speakingTurn = opts.isVoice;

  // Belt-and-braces spoken-text sanitizer (Unit 3). On spoken turns ONLY, run
  // every text delta through stripMarkdownForSpeech before it reaches the bus,
  // so no markdown token ever reaches TTS even if the prompt contract slips.
  // A markdown token (**, `, a leading list marker) can straddle two deltas, so
  // we hold back a short trailing carry that could be the start of such a token
  // and only flush it once the boundary is unambiguous. On text-only turns this
  // is a passthrough — the on-screen transcript stays rich.
  let sanitizeCarry = "";
  const emitSanitized = (delta: string): void => {
    if (!speakingTurn) {
      opts.onTextDelta(delta);
      return;
    }
    const combined = sanitizeCarry + delta;
    // Hold back a tail that could be an incomplete markdown token: a run of
    // markdown-significant chars (* _ ` # > [ ] ( )) OR a trailing newline that
    // a line-start marker might follow. Keep it small and bounded.
    const m = combined.match(/(\n[ \t]*[-*+#>\d.)]*|[*_`#>\[\]()]+)$/);
    const holdLen = m ? m[0].length : 0;
    const toEmit = holdLen > 0 ? combined.slice(0, combined.length - holdLen) : combined;
    sanitizeCarry = holdLen > 0 ? combined.slice(combined.length - holdLen) : "";
    if (toEmit) opts.onTextDelta(stripMarkdownForSpeech(toEmit));
  };

  // Deterministic leading-greeting guard (bgsd/time-aware-greeting). The prompt
  // now tells the model the correct time-of-day + greeting, but as belt-and-
  // braces we also correct a contradicting LEADING greeting on the wire (e.g.
  // a streamed "Good morning, sir." at 1:35 PM → "Good afternoon, sir."). We
  // buffer only the opener — up to the length of "Good afternoon" — until we
  // can tell whether it is a time-of-day greeting, then correct + release and
  // stop guarding for the rest of the turn. Non-greeting openers ("Noted,
  // sir.") resolve after the first word and pass straight through.
  const GREETING_PREFIXES = ["good morning", "good afternoon", "good evening", "good night"];
  let expectedTimeOfDay: TimeOfDay | null = null;
  let greetingGuardDone = false;
  let greetingBuf = "";
  const emitTextDelta = (delta: string): void => {
    if (greetingGuardDone || expectedTimeOfDay === null) {
      emitSanitized(delta);
      return;
    }
    greetingBuf += delta;
    const trimmed = greetingBuf.replace(/^\s+/, "");
    if (trimmed.length === 0) return; // still only whitespace — keep buffering
    const lower = trimmed.toLowerCase();
    // Keep buffering while the opener is still a STRICT prefix of some greeting
    // (more chars could complete it), bounded so a long non-greeting opener
    // can't stall the stream.
    const stillPrefix = GREETING_PREFIXES.some(
      (p) => p.startsWith(lower) && p.length > lower.length
    );
    if (stillPrefix && greetingBuf.length < 24) return;
    greetingGuardDone = true;
    const out = correctLeadingGreeting(greetingBuf, expectedTimeOfDay);
    greetingBuf = "";
    if (out) emitSanitized(out);
  };
  const flushTextCarry = (): void => {
    if (!greetingGuardDone && greetingBuf) {
      greetingGuardDone = true;
      const buf = greetingBuf;
      greetingBuf = "";
      emitSanitized(expectedTimeOfDay ? correctLeadingGreeting(buf, expectedTimeOfDay) : buf);
    }
    if (speakingTurn && sanitizeCarry) {
      opts.onTextDelta(stripMarkdownForSpeech(sanitizeCarry));
      sanitizeCarry = "";
    }
  };

  const [
    userProjects,
    userRows,
    userFacts,
    areasRows,
    recentCapturesRows,
    activeTasksRows,
    personalityRows,
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
    db.select({ id: areas.id, name: areas.name }).from(areas).where(eq(areas.userId, opts.userId)),
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
    // JARVIS management — per-user voice tuning. Fail-open: a load error →
    // empty array → undefined personalityConfig → today's default voice.
    db
      .select({
        preset: jarvisPersonalityConfig.preset,
        formality: jarvisPersonalityConfig.formality,
        verbosity: jarvisPersonalityConfig.verbosity,
        wit: jarvisPersonalityConfig.wit,
        customInstructions: jarvisPersonalityConfig.customInstructions,
      })
      .from(jarvisPersonalityConfig)
      .where(eq(jarvisPersonalityConfig.userId, opts.userId))
      .limit(1)
      .catch(
        () =>
          [] as Array<{
            preset: string;
            formality: string;
            verbosity: string;
            wit: string;
            customInstructions: string | null;
          }>
      ),
  ]);

  const userRow = userRows[0];

  // Resolve the time-of-day bucket for the greeting guard from the user's tz.
  // Set here (before the stream starts) so the guard can correct a
  // contradicting leading greeting on the wire (bgsd/time-aware-greeting).
  expectedTimeOfDay = timeOfDayForHour(
    currentHourInTimezone(userRow?.timezone ?? "America/New_York")
  );

  // Map the loaded row into the jarvis-core PersonalityConfig contract, or
  // leave undefined when no row exists (buildSystemPrompt → today's voice).
  const personalityRow = personalityRows[0];
  const personalityConfig: PersonalityConfig | undefined = personalityRow
    ? {
        preset: personalityRow.preset as PersonalityConfig["preset"],
        formality: personalityRow.formality as PersonalityConfig["formality"],
        verbosity: personalityRow.verbosity as PersonalityConfig["verbosity"],
        wit: personalityRow.wit as PersonalityConfig["wit"],
        customInstructions: personalityRow.customInstructions ?? null,
      }
    : undefined;

  const projectSummaries: ProjectSummary[] = userProjects.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
  }));

  const system = buildSystemPrompt({
    projects: projectSummaries,
    facts: userFacts as import("@hyperpolymath/jarvis-core").JarvisFact[],
    // Prompt flag = speakingTurn (spoken turns get the SPOKEN-OUTPUT CONTRACT).
    // Distinct from the tool-schema voiceActive above.
    voiceActive: speakingTurn,
    userDisplayName: userRow?.displayName ?? null,
    // JARVIS management — per-user voice tuning. Injected INSIDE the cached
    // prefix; an all-default (or absent) config emits no block, so today's
    // voice is unchanged.
    personalityConfig,
    // Computer-control steering (Phase 2). Appended after the cache breakpoint
    // inside buildSystemPrompt, so it does not invalidate the cached prefix.
    mode: opts.mode,
  });

  // Static entity-reference contract. Pushed here (web-side) rather than into
  // jarvis-core's cache-critical prompt-builder: it's a byte-stable constant, so
  // folding it into the prefix ahead of the state snapshot keeps the cache
  // intact and leaves the jarvis-core purity/stability tests untouched.
  system.push({ type: "text", text: REFERENCE_GUIDANCE });

  const stateVersion = userRow?.stateVersion ?? 1n;
  const todayDate = formatTodayDateInTimezone(userRow?.timezone ?? "America/New_York");
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

  const tools = [...buildToolDefinitions({ voiceActive }), ...STUDIO_WIDGET_TOOL_DEFINITIONS];
  const toolValidators = buildToolValidators(voiceActive);

  const preValidatedProjectIds = new Set<string>();
  void validateTurnReferences;

  const upstream = new AbortController();
  if (opts.abortSignal) {
    opts.abortSignal.addEventListener("abort", () => upstream.abort(), { once: true });
  }

  const actionTypes: string[] = [];
  let anyTextEmitted = false;
  // Spoken tool-latency ack: fire at most once per turn, and only when the model
  // went straight to a tool with NO spoken preamble (if it already said "Let me
  // check.", that IS the ack — a second one would double-speak).
  let ackEmitted = false;
  // Accumulated text actually streamed to the bus this turn — used by the
  // trailing-block dedupe (Unit 5) to drop a final-message ack the stream
  // already spoke ("Noted, sir — I'll remember that.Duly updated, sir.").
  let streamedText = "";
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

  const sttDoneAt_d: Date | null = opts.sttDoneAt ? new Date(opts.sttDoneAt) : null;
  const sttDoneAtSafe = sttDoneAt_d && !Number.isNaN(sttDoneAt_d.getTime()) ? sttDoneAt_d : null;

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
  // runs up to LOOP_CAP feedback rounds (plus up to CONTINUATION_CAP extra
  // passes when a pass is truncated at max_tokens), feeding tool_results back
  // each time the model stops with stop_reason="tool_use" or "max_tokens".
  //
  // Pitfalls observed (from RESEARCH.md):
  //   Pitfall 1 — tool_result content MUST be serialized to a string (JSON.stringify)
  //   Pitfall 2 — do NOT call buildHistory() inside the loop; loopMessages starts
  //               from anthropicMessages (already includes history)
  //   Pitfall 3 — session-entities scratchpad MUST have NO cache_control
  //   Anti-pattern — do NOT force tool_choice on inner passes; let model decide end_turn
  // ---------------------------------------------------------------------------

  const LOOP_CAP = 5;
  // Separate budget for continuation passes after a max_tokens truncation.
  // Large batches (e.g. 30 daily tasks) emit one tool_use block per item; if
  // the output is cut off mid-batch we keep going without burning the normal
  // feedback-round budget. Bounded so a pathological turn cannot loop forever.
  const CONTINUATION_CAP = 6;
  const loopMessages: typeof anthropicMessages = [...anthropicMessages];

  // Prime session-entities scratchpad from prior-turn history so the model
  // can reference entities created in earlier turns without a find call.
  const sessionEntities: SessionEntity[] = reconstructSessionEntitiesFromHistory(anthropicMessages);

  // Inbound reference resolution (S9). Parse the S1 tokens the user @-mentioned
  // this turn (and in recent history), resolve them to compact summaries, and
  // build the <referenced_entities> block. Built ONCE here — its content is
  // stable across the agentic loop's passes — and injected uncached below.
  // Fail-open: resolution never blocks a turn, it only enriches context.
  let referencedEntitiesBlock = "";
  try {
    referencedEntitiesBlock = await buildReferencedEntitiesBlock({
      userId: opts.userId,
      input: opts.input,
      messages: anthropicMessages,
    });
  } catch (err) {
    console.error("[jarvis] buildReferencedEntitiesBlock failed", err);
  }

  const totalUsage: RunTurnUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  try {
    let passCount = 0;
    let feedbackRounds = 0;
    let continuations = 0;

    while (feedbackRounds < LOOP_CAP && continuations < CONTINUATION_CAP) {
      passCount++;

      // Re-build system per pass to inject the (mutating) session-entities scratchpad
      // AFTER the snapshot block. Do NOT add cache_control here — Pitfall 3.
      // The temporal-context block is also uncached (changes every minute).
      const scratchpadText = buildSessionEntitiesBlock(sessionEntities);
      const temporalText = buildTemporalContextBlock(userRow?.timezone ?? "America/New_York");
      const passSystem = [
        ...system,
        { type: "text" as const, text: temporalText },
        ...(referencedEntitiesBlock
          ? [{ type: "text" as const, text: referencedEntitiesBlock }]
          : []),
        ...(scratchpadText ? [{ type: "text" as const, text: scratchpadText }] : []),
      ];

      const pendingActions: Promise<void>[] = [];
      const toolResultsThisPass: {
        id: string;
        name: ToolName;
        input: Record<string, unknown>;
        result: unknown;
      }[] = [];

      const anthStream = anth.messages.stream(
        {
          model: JARVIS_MODEL,
          // Generous budget for batched tool calls: each create_* block costs
          // roughly 110-130 output tokens, so 8192 comfortably covers a full
          // month of daily creations in a single pass.
          max_tokens: 8192,
          system: passSystem as unknown as never,
          tools: tools as unknown as never,
          // tool_choice: only forced on pass 1; subsequent passes let the model
          // choose end_turn vs more tools — anti-pattern prevention.
          tool_choice: (passCount === 1
            ? toolChoice
            : { type: "auto" as const }) as unknown as never,
          messages: loopMessages as unknown as never,
        },
        { signal: upstream.signal }
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

        // Spoken tool-latency ack. The model just chose a tool; if it hasn't
        // spoken anything yet this turn, emit an immediate acknowledgement so
        // JARVIS isn't silent while the tool runs. Fired once per turn, only on
        // spoken turns, and never when a preamble already streamed (that IS the
        // ack). The caller serializes it before the answer via the turn's TTS
        // queue and keeps it out of the persisted/visual transcript.
        if (opts.onAck && speakingTurn && !ackEmitted && !anyTextEmitted) {
          ackEmitted = true;
          opts.onAck(ackPhraseForTool(b.name ?? "", ackRotation++));
        }

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
            const toolName = b.name as ToolName;
            const toolInput = parsed.data as Record<string, unknown>;
            let result: Awaited<
              ReturnType<typeof executeStudioOpenWidget>
            >;

            if (toolName === "create_task") {
              const taskData = {
                ...(parsed.data as Parameters<typeof executor.createTask>[0]),
              };
              if (opts.parsedPriority) {
                (taskData as { priority?: string }).priority = opts.parsedPriority;
              }
              result = await executor.createTask(
                taskData as Parameters<typeof executor.createTask>[0],
                ctx
              );
            } else if (toolName === "create_capture") {
              result = await executor.createCapture(
                parsed.data as Parameters<typeof executor.createCapture>[0],
                ctx
              );
            } else if (toolName === "create_event") {
              result = await executor.createEvent(
                parsed.data as Parameters<typeof executor.createEvent>[0],
                ctx
              );
            } else if (toolName === "remember_fact") {
              result = await executor.rememberFact(
                parsed.data as Parameters<typeof executor.rememberFact>[0],
                ctx
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
                  cdata.suggested_action ?? null
                );
              }
              result = await executor.askClarification(
                parsed.data as Parameters<typeof executor.askClarification>[0],
                ctx
              );
            } else if (toolName === "update_task") {
              result = await executor.updateTask(
                parsed.data as Parameters<typeof executor.updateTask>[0],
                ctx
              );
            } else if (toolName === "delete_task") {
              result = await executor.deleteTask(
                parsed.data as Parameters<typeof executor.deleteTask>[0],
                ctx
              );
            } else if (toolName === "update_capture") {
              result = await executor.updateCapture(
                parsed.data as Parameters<typeof executor.updateCapture>[0],
                ctx
              );
            } else if (toolName === "delete_capture") {
              result = await executor.deleteCapture(
                parsed.data as Parameters<typeof executor.deleteCapture>[0],
                ctx
              );
            } else if (toolName === "update_event") {
              result = await executor.updateEvent(
                parsed.data as Parameters<typeof executor.updateEvent>[0],
                ctx
              );
            } else if (toolName === "delete_event") {
              result = await executor.deleteEvent(
                parsed.data as Parameters<typeof executor.deleteEvent>[0],
                ctx
              );
            } else if (toolName === "find_tasks") {
              result = await executor.findTasks(
                parsed.data as Parameters<typeof executor.findTasks>[0],
                ctx
              );
            } else if (toolName === "find_captures") {
              result = await executor.findCaptures(
                parsed.data as Parameters<typeof executor.findCaptures>[0],
                ctx
              );
            } else if (toolName === "find_events") {
              result = await executor.findEvents(
                parsed.data as Parameters<typeof executor.findEvents>[0],
                ctx
              );
            } else if (toolName === "create_person") {
              result = await executor.createPerson(
                parsed.data as Parameters<typeof executor.createPerson>[0],
                ctx
              );
            } else if (toolName === "find_people") {
              result = await executor.findPeople(
                parsed.data as Parameters<typeof executor.findPeople>[0],
                ctx
              );
            } else if (toolName === "link_people") {
              result = await executor.linkPeople(
                parsed.data as Parameters<typeof executor.linkPeople>[0],
                ctx
              );
            } else if (toolName === "open_url") {
              result = await executor.openUrl(
                parsed.data as Parameters<typeof executor.openUrl>[0],
                ctx
              );
            } else if (toolName === "open_app") {
              result = await executor.openApp(
                parsed.data as Parameters<typeof executor.openApp>[0],
                ctx
              );
            } else if (toolName === "open_workspace") {
              result = await executor.openWorkspace(
                parsed.data as Parameters<typeof executor.openWorkspace>[0],
                ctx
              );
            } else if (toolName === "web_search") {
              result = await executor.webSearch(
                parsed.data as Parameters<typeof executor.webSearch>[0],
                ctx
              );
            } else if (toolName === "send_message") {
              result = await executor.sendMessage(
                parsed.data as Parameters<typeof executor.sendMessage>[0],
                ctx
              );
            } else if (toolName === "system_control") {
              result = await executor.systemControl(
                parsed.data as Parameters<typeof executor.systemControl>[0],
                ctx
              );
            } else if (toolName === "type_text") {
              result = await executor.typeText(
                parsed.data as Parameters<typeof executor.typeText>[0],
                ctx
              );
            } else if (toolName === "press_key") {
              result = await executor.pressKey(
                parsed.data as Parameters<typeof executor.pressKey>[0],
                ctx
              );
            } else if (toolName === "take_screenshot") {
              result = await executor.takeScreenshot(
                parsed.data as Parameters<typeof executor.takeScreenshot>[0],
                ctx
              );
            } else if (toolName === "run_applescript") {
              result = await executor.runApplescript(
                parsed.data as Parameters<typeof executor.runApplescript>[0],
                ctx
              );
            } else if (toolName === "run_shortcut") {
              result = await executor.runShortcut(
                parsed.data as Parameters<typeof executor.runShortcut>[0],
                ctx
              );
            } else if (toolName === "play_music") {
              result = await executor.playMusic(
                parsed.data as Parameters<typeof executor.playMusic>[0],
                ctx
              );
            } else if (toolName === "get_weather") {
              result = await executor.getWeather(
                parsed.data as Parameters<typeof executor.getWeather>[0],
                ctx
              );
            } else if (toolName === "studio_open_widget") {
              result = await executeStudioOpenWidget(
                parsed.data as StudioOpenWidgetInput,
                ctx.userId
              );
            } else if (toolName === "studio_close_widget") {
              result = await executeStudioCloseWidget(
                parsed.data as StudioCloseWidgetInput,
                ctx.userId
              );
            } else if (toolName === "studio_set_hand_cursor") {
              result = await executeStudioSetHandCursor(
                parsed.data as StudioSetHandCursorInput,
                ctx.userId
              );
            } else if (toolName === "read_gmail") {
              result = await executor.readGmail(
                parsed.data as Parameters<typeof executor.readGmail>[0],
                ctx
              );
            } else if (toolName === "get_news") {
              result = await executor.getNews(
                parsed.data as Parameters<typeof executor.getNews>[0],
                ctx
              );
            } else if (toolName === "read_whatsapp") {
              result = await executor.readWhatsapp(
                parsed.data as Parameters<typeof executor.readWhatsapp>[0],
                ctx
              );
            } else if (toolName === "read_imessage") {
              result = await executor.readImessage(
                parsed.data as Parameters<typeof executor.readImessage>[0],
                ctx
              );
            } else if (toolName === "computer_use") {
              result = await executor.computerUse(
                parsed.data as Parameters<typeof executor.computerUse>[0],
                ctx
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
        if (s.trim().length > 0) {
          anyTextEmitted = true;
          streamedText += s;
        }
        emitTextDelta(s);
      });

      const final = await anthStream.finalMessage();
      await Promise.allSettled(pendingActions);
      toolLoopDoneAt_d = new Date();

      // Sum usage from this pass into the total
      totalUsage.input_tokens += final.usage.input_tokens ?? 0;
      totalUsage.output_tokens += final.usage.output_tokens ?? 0;
      totalUsage.cache_read_input_tokens +=
        (final.usage as RunTurnUsage).cache_read_input_tokens ?? 0;
      totalUsage.cache_creation_input_tokens +=
        (final.usage as RunTurnUsage).cache_creation_input_tokens ?? 0;

      // Per-pass cache-usage log. Verifies the 1h prefix cache is landing:
      // on the 2nd turn within TTL, cache_read should be ~9K (the stable
      // prefix) and cache_creation ~0. If cache_read stays near 0 the
      // prefix has been busted upstream (see prompt-builder.ts header).
      console.log(
        `[jarvis] cache read/create pass=${passCount}`,
        (final.usage as RunTurnUsage).cache_read_input_tokens ?? 0,
        (final.usage as RunTurnUsage).cache_creation_input_tokens ?? 0
      );

      // Append newly-touched entities to session-entities scratchpad
      for (const r of toolResultsThisPass) {
        const entity = entityFromToolResult(
          r.name as JarvisToolName,
          r.input,
          r.result as { ok: boolean; id?: string; receipt?: Record<string, unknown> }
        );
        if (entity) sessionEntities.push(entity);
      }

      // Exit loop if model chose to stop or no tools were invoked.
      // stop_reason "max_tokens" means the output was truncated mid-batch:
      // execute what landed, then continue so the model emits the rest.
      const truncated = final.stop_reason === "max_tokens";
      if (final.stop_reason !== "tool_use" && !truncated) break;
      if (toolResultsThisPass.length === 0) break; // safety: nothing executed, avoid spinning
      if (truncated) continuations++;
      else feedbackRounds++;

      // Build the feedback turns so the next pass can reference results.
      // On truncation, drop any tool_use block that was cut off before it
      // executed (it has no tool_result, and the API rejects assistant
      // tool_use blocks without a matching tool_result).
      const executedIds = new Set(toolResultsThisPass.map((r) => r.id));
      const assistantContent = truncated
        ? (final.content as Array<{ type: string; id?: string }>).filter(
            (b) => b.type !== "tool_use" || executedIds.has(b.id ?? "")
          )
        : final.content;
      loopMessages.push({ role: "assistant", content: assistantContent as never });
      const feedbackContent: unknown[] = toolResultsThisPass.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: JSON.stringify(r.result),
      }));
      if (truncated) {
        feedbackContent.push({
          type: "text" as const,
          text: "Your previous response was cut off by the output token limit. Continue where you left off: emit ONLY the remaining tool calls. Do not repeat any tool call that already has a result above.",
        });
      }
      loopMessages.push({
        role: "user",
        content: feedbackContent as never,
      });
    }

    // Flush any held-back sanitizer carry so the last streamed fragment speaks.
    flushTextCarry();

    // Emit a fallback text if the model produced neither text nor action
    const finalContent = (loopMessages[loopMessages.length - 1]?.content ?? []) as Array<{
      type?: string;
      text?: string;
    }>;
    const rawFinalTextBlocks = Array.isArray(finalContent)
      ? finalContent
          .filter(
            (b) => b.type === "text" && typeof b.text === "string" && b.text.trim().length > 0
          )
          .map((b) => b.text as string)
      : [];

    // Unit 5 — anti-double-ack / near-identical dedupe. The trailing final
    // message can re-emit an acknowledgement the stream already spoke (e.g.
    // "Noted, sir — I'll remember that." then "Duly updated, sir."), or repeat
    // itself across its own text blocks. Drop any block whose normalized text
    // duplicates (or is a near-identical substring of) something already
    // streamed this turn OR an earlier block in this same fallback.
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const isNearDuplicate = (candidate: string, prior: string): boolean => {
      const a = normalize(candidate);
      const b = normalize(prior);
      if (!a) return true;
      if (!b) return false;
      // Exact, or the short ack is fully contained in prior text (or vice versa).
      return a === b || (a.length <= 60 && b.includes(a)) || (b.length <= 60 && a.includes(b));
    };
    const streamedNorm = streamedText;
    const finalTextBlocks: string[] = [];
    for (const block of rawFinalTextBlocks) {
      const dupOfStreamed = streamedNorm.trim().length > 0 && isNearDuplicate(block, streamedNorm);
      const dupOfEarlier = finalTextBlocks.some((prev) => isNearDuplicate(block, prev));
      if (dupOfStreamed || dupOfEarlier) continue;
      finalTextBlocks.push(block);
    }

    if (!anyTextEmitted && finalTextBlocks.length > 0) {
      // Join with a PARAGRAPH break (not a single newline) so the sentence
      // splitter always sees a terminator between fallback blocks and never
      // glues two utterances into one run-on (defect 3a).
      const fallbackText = finalTextBlocks.join("\n\n");
      // Deterministic greeting guard also covers the non-streamed fallback path.
      const guardedFallback = expectedTimeOfDay
        ? correctLeadingGreeting(fallbackText, expectedTimeOfDay)
        : fallbackText;
      opts.onTextDelta(speakingTurn ? stripMarkdownForSpeech(guardedFallback) : guardedFallback);
      anyTextEmitted = true;
    }

    if (!anyTextEmitted && actionTypes.length === 0) {
      opts.onTextDelta("I didn't quite catch that, sir — try rephrasing as a thing to file.");
    }

    // U1 jarvis-web-brain — deterministic studio-widget backstop. The model is
    // told to pair ambient-data answers with the matching widget (weather →
    // weather widget, news → news widget) and to open the WhatsApp widget for
    // "open whatsapp / my messages" rather than launching the macOS app, but it
    // sometimes answers without opening one (or wrongly reaches for open_app).
    // If the raw utterance obviously asks for weather/news/whatsapp AND no
    // studio_open_widget fired this turn, nudge the widget open server-side so
    // "answer AND show" holds and "open whatsapp" always lands the HUD widget.
    // Conservative matcher; live-web scores/prices are NOT backstopped (they
    // need a real result URL only the model has).
    {
      const alreadyOpenedWidget = actionTypes.includes("studio_open_widget");
      const backstopKind = detectStudioBackstop(opts.input ?? "", alreadyOpenedWidget);
      if (backstopKind) {
        try {
          await executeStudioOpenWidget({ kind: backstopKind }, opts.userId);
          actionTypes.push("studio_open_widget");
        } catch {
          // Never let the backstop break the turn — the answer already streamed.
        }
      }
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
