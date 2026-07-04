// Routine runner — the execution heart of JARVIS natural-language routines.
//
// A routine is: one-or-more triggers → an ordered sequence of agentic BLOCKS.
// Trigger evaluation/scheduling and persistence are OTHER units. This module
// owns EXECUTION only: given a routine's blocks, it runs each block as ONE
// scoped agent turn through the existing `runJarvisTurnStream`, strictly
// SEQUENTIALLY (awaiting each block before the next), threads each block's
// output forward as a compact assistant note, and surfaces everything through
// streaming handlers so the API route can fan it out over the physical SSE bus.
//
// Design is grounded in run-turn.ts (see UNIT-PLAN-block-engine.md):
//   - `messages: [...threaded, {role:"user", content: directive+paramsHint}]`
//     + `toolChoice:{type:"tool", name: block.tool}` forces the block's tool on
//     pass 1 only (run-turn.ts:475), so passes 2..5 stay `auto` and a block can
//     both READ (forced) and ACT (e.g. create_task) within LOOP_CAP=5.
//   - `source:{device:"routine", input}` threads provenance into the executor
//     denormalization (executor.ts).

import {
  JARVIS_TOOL_NAMES,
  NARRATOR_CONTRACT,
  isJarvisToolName,
  zCreateTaskFor,
  zCreateCaptureFor,
  zCreateEventFor,
  zRememberFactFor,
  zAskClarificationFor,
} from "@hyperpolymath/jarvis-core";
import type { JarvisToolName, RoutineBlock } from "@hyperpolymath/jarvis-core";
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
  CreatePersonInputSchema,
  FindPeopleInputSchema,
  LinkPeopleInputSchema,
  OpenUrlInputSchema,
  OpenAppInputSchema,
  WebSearchInputSchema,
  SendMessageInputSchema,
  SystemControlInputSchema,
  TypeTextInputSchema,
  PressKeyInputSchema,
  TakeScreenshotInputSchema,
  RunApplescriptInputSchema,
  RunShortcutInputSchema,
  PlayMusicInputSchema,
  GetWeatherInputSchema,
  ReadGmailInputSchema,
  GetNewsInputSchema,
  ReadWhatsappInputSchema,
  ComputerUseInputSchema,
} from "@hyperpolymath/jarvis-core/tools";
import type { ZodType } from "zod";

import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";
import { generateBlockFillerLine } from "@/lib/jarvis/routine-filler";

// --- Public contract -------------------------------------------------------

export interface RoutineRunContext {
  userId: string;
  /**
   * BYOK Anthropic key for this run. Resolved by the CALLER (route), like the
   * voice/text route — the runner never reads env or resolves a key itself.
   */
  apiKey: string;
  /**
   * Provenance stamped onto every block turn. Routines set device "routine"
   * (or "routine:<name>") so receipts/history attribute correctly.
   */
  source: { device: string; input: "voice" | "text" };
  /** true when consumed by desktop TTS; false for web-text render. */
  isVoice: boolean;
  mode?: "computer";
  /**
   * Briefing cohesion (Option C). When true, blocks GATHER silently (their
   * tools fire + receipts render, but per-block narration is NOT streamed to
   * the bus), then ONE final butler synthesis turn speaks a single cohesive
   * brief under one synthetic turnId. Off (default) = per-block narration as
   * before, so action routines keep announce-before-act latency.
   */
  synthesize?: boolean;
  /**
   * Run gather blocks concurrently (bounded pool). Only honored when
   * `synthesize` is true — action routines always keep strict announce-before-act
   * ordering. Off/omitted = the sequential path, bit-for-bit unchanged.
   */
  parallel?: boolean;
  /** Human name of the routine — used for the synthesized block id prefix. */
  routineName: string;
  /**
   * Optional ROUTINE-LEVEL loading instruction. When a non-empty string, the
   * runner interprets it (via the same prose-only Anthropic call the per-block
   * fillers use) into a fresh spoken opener line that REPLACES the default
   * hardcoded "Welcome home, sir" opener. Empty/undefined = default opener.
   */
  loadingInstruction?: string;
  /** Stable id for this run — used to key per-block ids when a block has none. */
  runId?: string;
  abortSignal?: AbortSignal;
}

/**
 * Async callback for per-block loading-chatter. When present AND the block has a
 * non-empty `loadingInstruction`, the runner awaits this before the block's real
 * turn kicks so the spoken filler plays first. The handler is expected to
 * SPEAK the line (bus emit + queue serialization if multiple blocks gather in
 * parallel); a resolved Promise is the "ok to proceed to the real work" signal.
 */
export type OnBlockFiller = (
  blockId: string,
  text: string,
  index: number,
  total: number,
) => void | Promise<void>;

export interface BlockRunResult {
  blockId: string;
  tool: JarvisToolName;
  /** Accumulated narration text streamed by this block's turn. */
  text: string;
  actions: Array<{ toolUseId: string; name: string; result: unknown }>;
  /** Set when the block turn errored or was skipped (does NOT abort the run). */
  error?: string;
}

export interface RoutineRunHandlers {
  onBlockStart?(blockId: string, index: number, total: number): void;
  onTextDelta(blockId: string, delta: string): void;
  onAction(blockId: string, toolUseId: string, name: string, result: unknown): void;
  onBlockDone?(result: BlockRunResult): void;
  onRoutineDone(results: BlockRunResult[]): void;
  onError(blockId: string, message: string): void;

  // --- Option C (synthesis mode) handlers ---------------------------------
  // Emitted ONLY when ctx.synthesize is true. The synthesis turn streams under
  // ONE synthetic turnId so the desktop speaks a single cohesive utterance.
  /** Instant one-line opener spoken on routine start (while gathering). */
  onOpener?(text: string): void;
  /** The single synthesis utterance begins (its own turnId on the bus). */
  onSynthesisStart?(turnId: string): void;
  /** A delta of the synthesis brief (same turnId as onSynthesisStart). */
  onSynthesisDelta?(turnId: string, delta: string): void;
  /** The synthesis utterance is complete. */
  onSynthesisDone?(turnId: string): void;

  // --- Gather progress (synthesize mode only) ------------------------------
  // Fired for EVERY gather block in synthesize mode, on BOTH the sequential and
  // parallel paths (including unknown-tool skips and errored blocks), in
  // wall-clock order — parallel blocks interleave. Distinct from onBlockStart/
  // onBlockDone (which map 1:1 to bus response cycles and stay suppressed in
  // synth mode). The progress-bus unit maps these to jarvis-routine-progress
  // events; the hud-loader renders them. Start events arrive in index order
  // (the pool grabs indices in order); done events arrive in completion order.
  /** A gather block began executing. */
  onGatherBlockStart?(blockId: string, index: number, total: number, tool: JarvisToolName): void;
  /** A gather block settled (result.error set if it failed). */
  onGatherBlockDone?(result: BlockRunResult, index: number, total: number): void;

  // --- Per-block loading chatter (independent spoken turn) ------------------
  // Fired ONLY when the block has a non-empty `loadingInstruction` and the
  // runner has synthesized a fresh filler line for it. Emitted BEFORE the
  // block's real turn kicks — the caller SPEAKS the line (its own turnId
  // `${blockId}:filler`) via the same response-start/chunk/end trio the opener
  // uses, so it bypasses the synthesize-mode narration suppression exactly the
  // way the opener does. The runner AWAITS the callback (Promise-aware), so a
  // caller may sequence multiple parallel-gather fillers into a queue rather
  // than letting them talk over each other.
  onBlockFiller?: OnBlockFiller;
}

type ThreadMsg = { role: "assistant"; content: string };

// --- Param validators (mirror run-turn.ts buildToolValidators) -------------
// Open block params (Record<string,unknown>) are coerced against each tool's
// own Zod input schema before we inject them into the directive. On failure we
// fall back to the raw params (the executor's own validator in run-turn.ts is
// the real gate) but annotate the hint so the model knows they were rejected.
//
// The 5 create/remember/ask tools are voice-aware factories; instantiate them
// per-run with the run's voice flag so their coercion matches the turn.
function buildParamValidators(voiceActive: boolean): Record<JarvisToolName, ZodType> {
  return {
    create_task: zCreateTaskFor({ voiceActive }),
    create_capture: zCreateCaptureFor({ voiceActive }),
    create_event: zCreateEventFor({ voiceActive }),
    remember_fact: zRememberFactFor({ voiceActive }),
    ask_clarification: zAskClarificationFor({ voiceActive }),
    update_task: UpdateTaskInputSchema,
    delete_task: DeleteTaskInputSchema,
    update_capture: UpdateCaptureInputSchema,
    delete_capture: DeleteCaptureInputSchema,
    update_event: UpdateEventInputSchema,
    delete_event: DeleteEventInputSchema,
    find_tasks: FindTasksInputSchema,
    find_captures: FindCapturesInputSchema,
    find_events: FindEventsInputSchema,
    create_person: CreatePersonInputSchema,
    find_people: FindPeopleInputSchema,
    link_people: LinkPeopleInputSchema,
    open_url: OpenUrlInputSchema,
    open_app: OpenAppInputSchema,
    web_search: WebSearchInputSchema,
    send_message: SendMessageInputSchema,
    system_control: SystemControlInputSchema,
    type_text: TypeTextInputSchema,
    press_key: PressKeyInputSchema,
    take_screenshot: TakeScreenshotInputSchema,
    run_applescript: RunApplescriptInputSchema,
    run_shortcut: RunShortcutInputSchema,
    play_music: PlayMusicInputSchema,
    get_weather: GetWeatherInputSchema,
    read_gmail: ReadGmailInputSchema,
    get_news: GetNewsInputSchema,
    read_whatsapp: ReadWhatsappInputSchema,
    computer_use: ComputerUseInputSchema,
  };
}

/**
 * Validate/coerce a block's open params against the tool's Zod input schema.
 * Returns the coerced object on success, or `{ raw, invalid: true }` when the
 * params fail (the model + executor validator still fill/gate at turn time).
 */
export function validateBlockParams(
  tool: JarvisToolName,
  params: Record<string, unknown>,
  voiceActive: boolean,
): { value: Record<string, unknown>; invalid: boolean } {
  const validators = buildParamValidators(voiceActive);
  const schema = validators[tool];
  const parsed = schema.safeParse(params);
  if (parsed.success) {
    return { value: parsed.data as Record<string, unknown>, invalid: false };
  }
  return { value: params, invalid: true };
}

// --- Block → turn adapter (the ONLY seam reading routine-model field names) --

function paramsHint(tool: JarvisToolName, params: Record<string, unknown>, invalid: boolean): string {
  if (!params || Object.keys(params).length === 0) return "";
  const preface = invalid
    ? `[ROUTINE BLOCK PARAMS — seed values for the ${tool} call (did not fully validate against the tool schema; treat as hints and fill/correct as needed): `
    : `[ROUTINE BLOCK PARAMS — seed values for the ${tool} call; use unless the directive says otherwise: `;
  return `\n\n${preface}${JSON.stringify(params)}]`;
}

/**
 * Map a routine block + accumulated cross-block context into a run-turn call
 * shape. If routine-model renames `tool` / `nlDirective` / `params`, THIS is
 * the single function to patch.
 */
export function blockToTurn(
  block: RoutineBlock,
  threaded: ThreadMsg[],
  voiceActive: boolean,
): {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  toolChoice: { type: "tool"; name: string };
  input: string;
} {
  const directive =
    block.nlDirective && block.nlDirective.trim().length > 0
      ? block.nlDirective.trim()
      : `Run the ${block.tool} tool.`;
  const { value, invalid } = validateBlockParams(block.tool, block.params ?? {}, voiceActive);
  const content = directive + paramsHint(block.tool, value, invalid);
  return {
    messages: [...threaded, { role: "user", content }],
    toolChoice: { type: "tool", name: block.tool },
    input: directive,
  };
}

/**
 * Compress a finished block into a single compact assistant note threaded into
 * the next block's turn. We summarize (not thread raw tool_result JSON) to keep
 * cross-block token cost bounded AND to avoid Anthropic tool_use/tool_result
 * pairing hazards across a block boundary — plain assistant text has no pairing
 * constraint.
 */
export function summarizeBlockForThread(result: BlockRunResult): ThreadMsg {
  const MAX = 400;
  const head =
    result.text.length > MAX ? `${result.text.slice(0, MAX)}…` : result.text;
  const actionsPart =
    result.actions.length > 0
      ? ` — actions: ${result.actions.map((a) => a.name).join(", ")}`
      : "";
  const errorPart = result.error ? ` — error: ${result.error}` : "";
  return {
    role: "assistant",
    content: `[Block ${result.tool}] ${head}${actionsPart}${errorPart}`.trim(),
  };
}

// --- Runner ----------------------------------------------------------------

/**
 * Max concurrent gather turns in parallel synthesize mode. Bounds Anthropic
 * concurrent-stream pressure and executor fan-out (gmail/whatsapp bridges).
 * Exported so tests and a future per-routine knob can reference it.
 */
export const GATHER_CONCURRENCY = 4;

/**
 * Run ONE routine block as a single scoped agent turn. Behavior-neutral extract
 * of the runRoutine loop body: shared by the sequential loop and the parallel
 * gather pool. NEVER throws — a turn error lands in `result.error` via the
 * onError → settle path, so it can never reject a Promise.all / starve a worker.
 *
 * Handler emission:
 *  - non-synth: onBlockStart/onBlockDone/onTextDelta fire (bus per-block cycle).
 *  - synth: those are suppressed; onGatherBlockStart/onGatherBlockDone fire
 *    instead (progress signals, no bus response cycle). onAction always fires.
 *
 * The caller owns pushing the result into `results` and (sequential path only)
 * threading its summary forward — `runBlock` does neither.
 */
/**
 * The runner's block-id defaulting — an authored id when present, otherwise a
 * deterministic `${runId}:b${index}`. Exported so `fireRoutineOverBus`'s
 * progress skeleton computes IDENTICAL ids to the gather events the runner
 * emits for the same blocks.
 */
export function resolveBlockId(block: RoutineBlock, runId: string, index: number): string {
  return block.id && block.id.length > 0 ? block.id : `${runId}:b${index}`;
}

async function runBlock(
  block: RoutineBlock,
  index: number,
  total: number,
  threaded: ThreadMsg[],
  runId: string,
  synth: boolean,
  gatherVoice: boolean,
  ctx: RoutineRunContext,
  handlers: RoutineRunHandlers,
): Promise<BlockRunResult> {
  const blockId = resolveBlockId(block, runId, index);

  if (!synth) handlers.onBlockStart?.(blockId, index, total);
  // Gather-progress start (synthesize mode only, both paths). Fired before the
  // turn — including for the unknown-tool skip below (the progress UI needs it).
  if (synth) handlers.onGatherBlockStart?.(blockId, index, total, block.tool as JarvisToolName);

  // Per-block loading chatter. If the block author wrote a `loadingInstruction`,
  // synthesize a fresh spoken filler line and hand it to the bus BEFORE the
  // real turn kicks. Independent of synth mode — the filler is an independent
  // spoken emission on its own turnId (see routine-fire), so it plays even
  // when the block itself gathers silently. Errors are swallowed: a missing
  // filler must never break the routine.
  if (handlers.onBlockFiller && block.loadingInstruction && block.loadingInstruction.trim().length > 0) {
    try {
      const line = await generateBlockFillerLine({
        apiKey: ctx.apiKey,
        loadingInstruction: block.loadingInstruction,
        tool: String(block.tool),
        routineName: ctx.routineName,
        abortSignal: ctx.abortSignal,
      });
      if (line) {
        await handlers.onBlockFiller(blockId, line, index, total);
      }
    } catch (err) {
      console.error("[routine-runner] filler emit failed", err);
    }
  }

  // Defensive guard: unknown tool → skip block, surface error, keep going.
  // (routine-model validates authored blocks; this is defense in depth.)
  if (!isJarvisToolName(block.tool)) {
    const message = `unknown tool: ${String(block.tool)} (allowed: ${JARVIS_TOOL_NAMES.length} tools)`;
    handlers.onError(blockId, message);
    const skipped: BlockRunResult = {
      blockId,
      tool: block.tool,
      text: "",
      actions: [],
      error: message,
    };
    if (!synth) handlers.onBlockDone?.(skipped);
    if (synth) handlers.onGatherBlockDone?.(skipped, index, total);
    return skipped;
  }

  const { messages, toolChoice, input } = blockToTurn(block, threaded, gatherVoice);

  let blockText = "";
  const blockActions: BlockRunResult["actions"] = [];
  let blockError: string | undefined;

  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    void runJarvisTurnStream({
      userId: ctx.userId,
      apiKey: ctx.apiKey,
      input,
      messages,
      toolChoice,
      isVoice: gatherVoice,
      mode: ctx.mode,
      source: ctx.source,
      sttDoneAt: null,
      vadEndAt: undefined,
      abortSignal: ctx.abortSignal,
      onTextDelta: (delta) => {
        // Always capture the text (it feeds cross-block threading + the
        // synthesis receipts); only STREAM it to the bus when NOT synthesizing.
        blockText += delta;
        if (!synth) handlers.onTextDelta(blockId, delta);
      },
      onAction: (toolUseId, name, result) => {
        // Receipts render on screen in BOTH modes (onAction always fires).
        blockActions.push({ toolUseId, name, result });
        handlers.onAction(blockId, toolUseId, name, result);
      },
      onDone: () => settle(),
      onError: (message) => {
        blockError = message;
        handlers.onError(blockId, message);
        settle();
      },
    });
  });

  const result: BlockRunResult = {
    blockId,
    tool: block.tool,
    text: blockText,
    actions: blockActions,
    ...(blockError ? { error: blockError } : {}),
  };
  if (!synth) handlers.onBlockDone?.(result);
  if (synth) handlers.onGatherBlockDone?.(result, index, total);
  return result;
}

/**
 * Execute a routine's blocks sequentially over `runJarvisTurnStream`.
 *
 * - Blocks run strictly in array order; block N+1 does not start until block N's
 *   turn settles (onDone/onError).
 * - Each block's tool is FORCED on pass 1 via toolChoice; later passes are auto,
 *   so a block can read-then-act (the routine "morning brief" contract).
 * - A block error is ISOLATED: it is surfaced via `onError` and recorded on the
 *   result, but the routine continues with the next block.
 * - Cross-block context is threaded as compact assistant notes (summaries).
 *
 * Returns the full BlockRunResult[] for telemetry/receipts; everything is also
 * streamed through `handlers` as it happens.
 */
export async function runRoutine(
  blocks: RoutineBlock[],
  ctx: RoutineRunContext,
  handlers: RoutineRunHandlers,
): Promise<BlockRunResult[]> {
  const runId = ctx.runId ?? (globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}`);
  const threaded: ThreadMsg[] = [];
  const results: BlockRunResult[] = [];
  const synth = ctx.synthesize === true;

  // Option C: an instant one-line opener so there is audio feedback the moment
  // the routine fires, while the blocks gather silently behind it. When the
  // routine author wrote a routine-level `loadingInstruction`, INTERPRET it into
  // a fresh (non-deterministic) opener line that REPLACES the default; otherwise
  // keep the hardcoded default opener. Failure-isolated: any throw/null from the
  // filler generation falls back to the default so the opener is never skipped.
  //
  // CRITICAL: the opener must NOT block the gather. We kick it off as a
  // concurrent promise (the interpreted-line LLM round-trip runs in parallel)
  // and DO NOT await it here, so block fetching starts immediately. We await it
  // later — just before the synthesis brief — so the opener is always spoken
  // before the brief, without delaying data collection.
  let openerPromise: Promise<void> | undefined;
  if (synth) {
    openerPromise = (async () => {
      const DEFAULT_OPENER = "Welcome home, sir — one moment.";
      let opener = DEFAULT_OPENER;
      const instruction = ctx.loadingInstruction?.trim();
      if (instruction) {
        try {
          const line = await generateBlockFillerLine({
            apiKey: ctx.apiKey,
            loadingInstruction: instruction,
            tool: "routine",
            routineName: ctx.routineName,
            abortSignal: ctx.abortSignal,
          });
          if (line) opener = line;
        } catch (err) {
          console.error("[routine-runner] opener filler failed, using default", err);
        }
      }
      handlers.onOpener?.(opener);
    })();
  }

  // In synthesis mode the blocks GATHER: their tools fire and receipts render
  // (onAction), but their per-block narration is NOT streamed to the bus, and
  // we run them non-voice so no spoken shaping is wasted on data we'll re-narrate.
  const gatherVoice = synth ? false : ctx.isVoice;

  const parallelGather = synth && ctx.parallel === true && blocks.length > 1;

  if (parallelGather) {
    // Independent gathers: EMPTY thread per block (no cross-block threading —
    // that reasoning moves to the synthesis turn), a bounded work-stealing
    // worker pool, and results pinned to `slots[i]` so receipts keep authored
    // block order even when block 3 settles before block 0.
    const total = blocks.length;
    const slots: BlockRunResult[] = new Array(total);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const i = next++;
        if (i >= total) return;
        // `next++` in single-threaded JS is atomic work-stealing; no lock needed.
        slots[i] = await runBlock(
          blocks[i],
          i,
          total,
          [], // empty thread — parallel gathers do not see siblings
          runId,
          synth,
          gatherVoice,
          ctx,
          handlers,
        );
      }
    };
    const width = Math.min(GATHER_CONCURRENCY, total);
    await Promise.all(Array.from({ length: width }, () => worker()));
    results.push(...slots);
  } else {
    for (let i = 0; i < blocks.length; i++) {
      const result = await runBlock(
        blocks[i],
        i,
        blocks.length,
        threaded,
        runId,
        synth,
        gatherVoice,
        ctx,
        handlers,
      );
      results.push(result);
      threaded.push(summarizeBlockForThread(result));
    }
  }

  // Option C: after silent gathering, run ONE butler synthesis turn over the
  // labeled block receipts and stream it under a single synthetic turnId, so
  // the desktop speaks exactly one cohesive brief. First settle the concurrent
  // opener so its audio is always emitted before the brief (best-effort — a
  // failed opener never blocks the brief).
  if (openerPromise) {
    try {
      await openerPromise;
    } catch {
      /* opener is best-effort; never block the brief on it */
    }
  }
  if (synth) {
    await runSynthesisTurn(runId, blocks, results, ctx, handlers);
  }

  handlers.onRoutineDone(results);
  return results;
}

/**
 * Build the labeled block-receipts user message for the synthesis turn. Each
 * block contributes its narration text (what the model already read from its
 * tool) plus the action names it fired, under an UPPERCASE label derived from
 * its tool. This is RAW DATA for the narrator's eyes — the SPOKEN-OUTPUT +
 * NARRATOR contracts turn it into a single spoken brief.
 */
export function buildSynthesisReceipts(
  blocks: RoutineBlock[],
  results: BlockRunResult[],
): string {
  const labelFor = (tool: string): string =>
    tool
      .replace(/^(get|read|find)_/, "")
      .replace(/_/g, " ")
      .toUpperCase();
  const lines: string[] = [];
  for (const r of results) {
    const label = labelFor(r.tool);
    if (r.error) {
      lines.push(`${label}: (unavailable — ${r.error})`);
      continue;
    }
    const body = r.text.trim();
    const actions =
      r.actions.length > 0 ? ` [actions: ${r.actions.map((a) => a.name).join(", ")}]` : "";
    lines.push(`${label}: ${body || "(no notable data)"}${actions}`);
  }
  return lines.join("\n\n");
}

/**
 * Run the single synthesis turn. It streams under ONE synthetic turnId
 * (`${runId}:brief`) with toolChoice:{type:"none"} (prose only) and the run's
 * voice flag, so the desktop hears one cohesive utterance.
 */
async function runSynthesisTurn(
  runId: string,
  blocks: RoutineBlock[],
  results: BlockRunResult[],
  ctx: RoutineRunContext,
  handlers: RoutineRunHandlers,
): Promise<void> {
  const synthTurnId = `${runId}:brief`;
  const receipts = buildSynthesisReceipts(blocks, results);
  const userMessage = `${NARRATOR_CONTRACT}\n\n${receipts}`;

  handlers.onSynthesisStart?.(synthTurnId);

  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    void runJarvisTurnStream({
      userId: ctx.userId,
      apiKey: ctx.apiKey,
      turnId: synthTurnId,
      input: "routine briefing synthesis",
      messages: [{ role: "user", content: userMessage }],
      // Prose only — the narrator must not fire tools; it just speaks the read.
      toolChoice: { type: "none" },
      isVoice: ctx.isVoice,
      mode: ctx.mode,
      source: ctx.source,
      sttDoneAt: null,
      vadEndAt: undefined,
      abortSignal: ctx.abortSignal,
      onTextDelta: (delta) => handlers.onSynthesisDelta?.(synthTurnId, delta),
      onAction: () => {
        // toolChoice:none — no tools should fire; ignore defensively.
      },
      onDone: () => settle(),
      onError: (message) => {
        handlers.onError(synthTurnId, message);
        settle();
      },
    });
  });

  handlers.onSynthesisDone?.(synthTurnId);
}
