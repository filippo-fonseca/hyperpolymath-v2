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
  /** Human name of the routine — used for the synthesized block id prefix. */
  routineName: string;
  /** Stable id for this run — used to key per-block ids when a block has none. */
  runId?: string;
  abortSignal?: AbortSignal;
}

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

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockId = block.id && block.id.length > 0 ? block.id : `${runId}:b${i}`;

    handlers.onBlockStart?.(blockId, i, blocks.length);

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
      results.push(skipped);
      handlers.onBlockDone?.(skipped);
      threaded.push(summarizeBlockForThread(skipped));
      continue;
    }

    const { messages, toolChoice, input } = blockToTurn(block, threaded, ctx.isVoice);

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
        isVoice: ctx.isVoice,
        mode: ctx.mode,
        source: ctx.source,
        sttDoneAt: null,
        vadEndAt: undefined,
        abortSignal: ctx.abortSignal,
        onTextDelta: (delta) => {
          blockText += delta;
          handlers.onTextDelta(blockId, delta);
        },
        onAction: (toolUseId, name, result) => {
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
    results.push(result);
    handlers.onBlockDone?.(result);
    threaded.push(summarizeBlockForThread(result));
  }

  handlers.onRoutineDone(results);
  return results;
}
