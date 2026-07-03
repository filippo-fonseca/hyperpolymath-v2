// apps/desktop/src/actions/confirm-gate.ts
// The send_message confirm gate (safety-critical). iMessage has no draft verb
// — AppleScript `send` fires immediately — so the confirmation gate lives HERE,
// before any script runs. A send_message action is never executed on arrival:
// it is held as a pending action and dispatched ONLY on a spoken affirmative.
//
// Confirmation flows (both supported):
//   1. Single-turn: the model speaks the readback ("…shall I send it, sir?")
//      AND emits the tool call in the same turn. The action arrives, is held,
//      and the user's "yes" in the continue-listening window releases it.
//   2. Two-turn (personality.ts SEND_MESSAGE guardrail: "Emit send_message
//      only after an affirmative reply"): the model asks first WITHOUT the
//      tool call; the user's "yes" triggers a second turn that emits it. In
//      that flow the transcript that caused the action WAS the confirmation —
//      demanding a second "yes" would break the conversation. So an action
//      arriving right after an affirmative transcript is treated as
//      pre-confirmed and sent immediately.
//
// Double-send protection: in flow 1 the desktop sends on the user's "yes",
// but that same "yes" also reaches the server agent, which (per its
// guardrail) may re-emit the send_message tool call. An identical
// recipient+text arriving within the dedupe window is suppressed.
//
// Expiry: a pending confirm is discarded when the conversation returns to
// idle (the continue window closed without an answer) or after a hard TTL.

import { onTranscriptReceived } from "@/audio/capture";
import { onJarvisState } from "@/conversation/state-machine";
import { buildIMessageSend, runAppleScript } from "@/actions/applescript";
import type { SendMessageAction } from "@/actions/dispatcher";

/** Spoken affirmatives that release a pending send. */
const AFFIRM_RE =
  /^\s*(?:yes|yeah|yep|yup|sure|ok(?:ay)?|confirm|affirmative|do it|go ahead|send(?: it| that| the message)?|please do|please send(?: it)?)\b/i;
/** Spoken negatives that discard a pending send. Checked BEFORE affirmatives
 *  so "no, don't send it" never matches the `send it` affirmative. */
const NEGATE_RE =
  /^\s*(?:no|nope|nah|cancel|stop|don'?t|do not|never ?mind|nevermind|negative|hold (?:off|on)|scratch that)\b/i;

/** How fresh a preceding affirmative transcript must be to pre-confirm an
 *  arriving send_message action (two-turn flow). */
const PRECONFIRM_WINDOW_MS = 20_000;
/** Suppress an identical recipient+text send arriving within this window
 *  (the model re-emitting the tool call for a send we already executed). */
const DEDUPE_WINDOW_MS = 30_000;
/** Hard backstop: a pending confirm never outlives this, even if the
 *  conversation somehow stays active. */
const PENDING_TTL_MS = 120_000;

interface PendingSend {
  action: SendMessageAction;
  heldAt: number;
}

let pending: PendingSend | null = null;
let pendingTtlTimer: ReturnType<typeof setTimeout> | null = null;
let lastTranscript: { text: string; at: number } | null = null;
let lastSent: { recipient: string; text: string; at: number } | null = null;
let started = false;

/** Presentational signal for the HUD: `true` while a send_message is held
 *  awaiting spoken confirmation, `false` once it is sent, declined, replaced
 *  or expired. Drives the amber guarded-confirm ring on the orb (main.ts
 *  mirrors it onto body[data-confirm-pending]). No gate logic keys off it. */
type ConfirmPendingListener = (isPending: boolean) => void;
const pendingListeners = new Set<ConfirmPendingListener>();

export function onConfirmPendingChange(fn: ConfirmPendingListener): () => void {
  pendingListeners.add(fn);
  return () => {
    pendingListeners.delete(fn);
  };
}

function emitPendingChange(isPending: boolean): void {
  for (const fn of pendingListeners) fn(isPending);
}

function clearPendingState(): void {
  const hadPending = pending !== null;
  pending = null;
  if (pendingTtlTimer) {
    clearTimeout(pendingTtlTimer);
    pendingTtlTimer = null;
  }
  if (hadPending) emitPendingChange(false);
}

function discardPending(reason: string): void {
  if (!pending) return;
  // eslint-disable-next-line no-console
  console.log(
    `[confirm] pending send_message to "${pending.action.recipient}" discarded — ${reason}`,
  );
  clearPendingState();
}

/** Run the actual iMessage send through the Rust AppleScript command. */
async function executeSend(action: SendMessageAction): Promise<void> {
  const script = buildIMessageSend(action.recipient, action.text);
  try {
    await runAppleScript(script, `send-imessage:${action.recipient}`);
    lastSent = { recipient: action.recipient, text: action.text, at: Date.now() };
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] send_message dispatched to "${action.recipient}" (${action.text.length} chars)`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[confirm] send_message to "${action.recipient}" failed`, err);
  }
}

/**
 * Entry point from the dispatcher: a send_message action arrived. Dedupe →
 * pre-confirm → hold. NEVER sends unless the user has confirmed aloud (either
 * just now, in the transcript that produced this very action, or later in the
 * continue-listening window). The gate applies regardless of the
 * requires_confirm flag — every send_message is treated as destructive.
 */
export function holdSendMessage(action: SendMessageAction): void {
  const now = Date.now();

  if (
    lastSent &&
    lastSent.recipient === action.recipient &&
    lastSent.text === action.text &&
    now - lastSent.at < DEDUPE_WINDOW_MS
  ) {
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] duplicate send_message to "${action.recipient}" suppressed — already sent ${now - lastSent.at}ms ago`,
    );
    return;
  }

  if (
    lastTranscript &&
    now - lastTranscript.at < PRECONFIRM_WINDOW_MS &&
    !NEGATE_RE.test(lastTranscript.text) &&
    AFFIRM_RE.test(lastTranscript.text)
  ) {
    // Two-turn flow: the transcript that triggered this turn was the spoken
    // confirmation. Consume it so it can't confirm anything else.
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] send_message pre-confirmed by preceding affirmative ("${lastTranscript.text}") — sending`,
    );
    lastTranscript = null;
    void executeSend(action);
    return;
  }

  if (pending) {
    // Newest wins — the model amended the message (e.g. "change it to …").
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] replacing pending send_message to "${pending.action.recipient}" with a newer one`,
    );
  }
  clearPendingState();
  pending = { action, heldAt: now };
  emitPendingChange(true);
  pendingTtlTimer = setTimeout(() => {
    pendingTtlTimer = null;
    discardPending(`TTL expired (${PENDING_TTL_MS}ms) with no spoken answer`);
  }, PENDING_TTL_MS);
  // eslint-disable-next-line no-console
  console.log(
    `[confirm] holding send_message to "${action.recipient}" — awaiting spoken confirmation ("yes" / "send it" … or "no" / "cancel")`,
  );
}

/**
 * Try to resolve the pending send with a fresh transcript from the
 * continue-listening window. Returns true when the transcript was consumed as
 * a confirm/deny; anything else leaves the pending in place (the user may be
 * amending — a replacement action will arrive) until the window closes.
 */
function resolvePendingWithTranscript(text: string): boolean {
  if (!pending) return false;
  if (NEGATE_RE.test(text)) {
    discardPending(`user declined ("${text}")`);
    return true;
  }
  if (AFFIRM_RE.test(text)) {
    const action = pending.action;
    clearPendingState();
    // eslint-disable-next-line no-console
    console.log(`[confirm] spoken confirmation received ("${text}") — sending`);
    void executeSend(action);
    return true;
  }
  return false;
}

/**
 * Wire the gate to the voice loop. Called once from boot(). Subscribes to:
 *   - onTranscriptReceived: confirm/deny a pending send, and track the latest
 *     unconsumed transcript for the two-turn pre-confirm path.
 *   - onJarvisState: when the conversation FSM returns to idle, the continue
 *     window has closed — an unanswered pending expires (discard + log).
 */
export function startConfirmGate(): void {
  if (started) return;
  started = true;

  onTranscriptReceived((text) => {
    const consumed = resolvePendingWithTranscript(text);
    // Consumed transcripts are spent — never record them as `lastTranscript`,
    // or an already-used "yes" could pre-confirm the model's re-emitted
    // tool call for the same send.
    if (!consumed) {
      lastTranscript = { text, at: Date.now() };
    }
  });

  onJarvisState((state) => {
    if (state === "idle" && pending) {
      discardPending("continue window closed without an answer");
    }
  });

  // eslint-disable-next-line no-console
  console.log("[confirm] send_message confirm gate armed");
}
