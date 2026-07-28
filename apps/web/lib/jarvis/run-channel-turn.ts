/**
 * run-channel-turn.ts — the channel-agnostic JARVIS turn.
 *
 * WHERE THIS SITS
 * ---------------
 *   channel wrapper (SSE route / physical bus route / SMS webhook)
 *        │
 *        ▼
 *   runChannelTurn      ← this file: key resolution, hint injection,
 *        │                tool_choice, history, jarvis_turns persistence,
 *        │                and awaiting the stream to a single final string
 *        ▼
 *   runJarvisTurnStream ← lib/jarvis/run-turn.ts, already channel-agnostic:
 *                         it takes a userId, a message array and callbacks,
 *                         and knows nothing about HTTP, SSE or a device.
 *
 * The engine never needed a refactor. What was duplicated was everything in
 * the middle: `/api/jarvis/voice/text` carried roughly 180 lines copied from
 * `/api/jarvis`, and both files had a "keep the two in sync" comment. A third
 * text channel (SMS) would have made three copies of the same drift risk, so
 * the middle layer became this function and each channel became a thin wrapper
 * that supplies its own transport callbacks.
 *
 * CONTRACT
 * --------
 * `runChannelTurn` resolves the turn to completion and returns the joined final
 * text plus every executed action. Streaming channels still get live deltas via
 * `onTextDelta` / `onAction`; non-streaming channels (SMS) simply ignore those
 * and use the returned string. Memory is shared across every channel because
 * history comes from `buildRecentHistory(userId)`, which reads the same
 * `jarvis_turns` table the web console writes, so a turn started over SMS is
 * visible to the web console and vice versa.
 *
 * It never throws for a model/tool failure: a failed turn resolves with
 * `status: "error"` and the message, so a webhook can record it in its ledger
 * rather than dying inside `after()`.
 */

import { getUserKeyOrNull } from "@/lib/byok/keys";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";
import { joinStreamTextChunks } from "@/lib/jarvis/join-stream-text";
import { buildRecentHistory } from "@/lib/jarvis/recent-history";
import { runJarvisTurnStream } from "@/lib/jarvis/run-turn";
import { type ParsedDateHint, type SlashCommand, buildTurnHints } from "@/lib/jarvis/turn-hints";

/** Anthropic content-block shapes carried by multi-turn agentic history. */
export type ChannelContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface ChannelMessage {
  role: "user" | "assistant";
  content: string | ChannelContentBlock[];
}

/** One executed tool call, in the shape `jarvis_turns.actions` persists. */
export interface ChannelAction {
  toolUseId: string;
  name: string;
  result: unknown;
}

export interface RunChannelTurnOptions {
  userId: string;
  /** The user's raw text. Persisted verbatim; hints are appended separately. */
  text: string;
  /**
   * Provenance label denormalized onto rows the executor creates
   * (`source.device`): "Web", a paired device name, "SMS", "routine", …
   */
  deviceLabel: string;
  /** Input modality for provenance. Defaults to "text". */
  inputModality?: "voice" | "text";
  /**
   * Pre-minted assistant turn id. Streaming channels mint it themselves so
   * they can announce it before the turn starts (the desktop reducer pairs a
   * user bubble to its reply by identity). Omitted → generated here.
   */
  turnId?: string;
  /**
   * BYOK Anthropic key. When omitted, resolved as the user's own key falling
   * back to the owner env key — the policy every server-driven (non-browser)
   * channel already used. The browser console resolves strictly and passes its
   * key in, so a public user can never spend the owner's tokens.
   */
  apiKey?: string;
  /**
   * Conversation history. Omitted → `buildRecentHistory(userId)`, the
   * channel-agnostic memory primitive. Pass `[]` to run with no history.
   */
  history?: ChannelMessage[];
  slashCommand?: SlashCommand | null;
  parsedDates?: ParsedDateHint[];
  parsedPriority?: "P∞" | "P1" | "P2" | "P3";
  linkedProjectIds?: string[];
  linkedHashtags?: string[];
  linkedPeople?: Array<{ id: string; name: string }>;
  /**
   * Facts about the channel the model should know but the user did not type
   * (reply-length constraints, unreadable attachments). Model-visible only.
   */
  channelNotes?: string[];
  /** Computer-control steering, from the desktop `X-Jarvis-Mode` header. */
  mode?: "computer";
  /** True when the reply is spoken aloud (injects the spoken-output contract). */
  isVoice?: boolean;
  sttDoneAt?: number | null;
  vadEndAt?: number;
  abortSignal?: AbortSignal;
  /** Live text deltas, already sentence-glued by the engine. */
  onTextDelta?: (delta: string) => void;
  onAction?: (toolUseId: string, name: string, result: unknown) => void;
  /** Fired once the stream finishes, BEFORE the assistant row is persisted. */
  onDone?: () => void;
  onError?: (message: string) => void;
}

export interface RunChannelTurnResult {
  /** The assistant turn id (also the `jarvis_turns` row id). */
  turnId: string;
  /** The user turn id persisted for this utterance. */
  userTurnId: string;
  /** The joined final assistant prose. Empty for a pure tool turn. */
  text: string;
  actions: ChannelAction[];
  status: "done" | "error";
  errorMessage: string | null;
}

/**
 * Run one JARVIS turn on any channel and resolve with its final text.
 */
export async function runChannelTurn(opts: RunChannelTurnOptions): Promise<RunChannelTurnResult> {
  const turnId = opts.turnId ?? crypto.randomUUID();
  const userTurnId = crypto.randomUUID();
  const userTurnCreatedAt = new Date();
  // One millisecond apart so the scrollback (and buildRecentHistory) orders the
  // pair correctly even when both rows land in the same clock tick.
  const assistantTurnCreatedAt = new Date(userTurnCreatedAt.getTime() + 1);

  const { userContent, toolChoice } = buildTurnHints({
    input: opts.text,
    slashCommand: opts.slashCommand,
    parsedDates: opts.parsedDates,
    parsedPriority: opts.parsedPriority,
    linkedProjectIds: opts.linkedProjectIds,
    linkedHashtags: opts.linkedHashtags,
    linkedPeople: opts.linkedPeople,
    channelNotes: opts.channelNotes,
  });

  // Resolve history BEFORE persisting the current user turn, so this utterance
  // is never double-counted in the recency window. Fail open: a load error
  // degrades to no history rather than losing the turn.
  let history: ChannelMessage[] = opts.history ?? [];
  if (!opts.history) {
    try {
      history = await buildRecentHistory(opts.userId);
    } catch (err) {
      console.error("[run-channel-turn] buildRecentHistory failed; running without history", err);
      history = [];
    }
  }

  // Persist the user turn. Awaited (unlike the old fire-and-forget copy) so a
  // webhook that resolves this promise knows the row exists before it reports
  // success, and a retry cannot race the insert. A failure here is logged and
  // does not abort the turn — losing scrollback is better than losing the work.
  await db
    .insert(jarvisTurns)
    .values({
      id: userTurnId,
      userId: opts.userId,
      kind: "user",
      text: opts.text,
      textDelta: null,
      actions: [],
      clarification: null,
      status: null,
      errorMessage: null,
      createdAt: userTurnCreatedAt,
    })
    .onConflictDoNothing()
    .catch((err: unknown) => {
      console.error("[run-channel-turn] failed to persist user turn", err);
    });

  // BYOK. run-turn never reads the environment (run-turn.ts:107-112) — the
  // caller resolves. Server-driven channels fall back to the owner env key
  // because there is no browser session to prompt for one.
  const apiKey =
    opts.apiKey ??
    (await getUserKeyOrNull(opts.userId, "anthropic")) ??
    process.env.ANTHROPIC_API_KEY ??
    "";

  const messages: ChannelMessage[] = [...history, { role: "user", content: userContent }];

  let assistantText = "";
  const actions: ChannelAction[] = [];
  // Held on an object rather than a bare `let` so the assignment inside the
  // onError closure is visible to the type checker after the await.
  const outcome: { errorMessage: string | null } = { errorMessage: null };

  await runJarvisTurnStream({
    userId: opts.userId,
    apiKey,
    turnId,
    input: opts.text,
    messages,
    toolChoice,
    parsedPriority: opts.parsedPriority,
    mode: opts.mode,
    source: { device: opts.deviceLabel, input: opts.inputModality ?? "text" },
    isVoice: opts.isVoice ?? false,
    sttDoneAt: opts.sttDoneAt ?? null,
    vadEndAt: opts.vadEndAt,
    abortSignal: opts.abortSignal,
    onTextDelta: (delta) => {
      // The engine already bridges the missing space between the text blocks
      // Anthropic emits around a tool_use; re-applying the same join here is
      // idempotent (it no-ops once whitespace is present) and keeps the join
      // correct if this function is ever fed a raw stream.
      assistantText += joinStreamTextChunks(assistantText, delta);
      opts.onTextDelta?.(delta);
    },
    onAction: (toolUseId, name, result) => {
      actions.push({ toolUseId, name, result });
      opts.onAction?.(toolUseId, name, result);
    },
    onDone: () => {
      opts.onDone?.();
    },
    onError: (message) => {
      outcome.errorMessage = message;
      opts.onError?.(message);
    },
  });

  const errorMessage = outcome.errorMessage;
  const status: "done" | "error" = errorMessage ? "error" : "done";

  await db
    .insert(jarvisTurns)
    .values({
      id: turnId,
      userId: opts.userId,
      kind: "assistant",
      text: null,
      textDelta: assistantText || null,
      actions,
      clarification: null,
      status,
      errorMessage,
      createdAt: assistantTurnCreatedAt,
    })
    .onConflictDoUpdate({
      target: jarvisTurns.id,
      set: { textDelta: assistantText || null, actions, status, errorMessage },
    })
    .catch((err: unknown) => {
      console.error("[run-channel-turn] failed to persist assistant turn", err);
    });

  return { turnId, userTurnId, text: assistantText, actions, status, errorMessage };
}
