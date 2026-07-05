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

import { fetch } from "@tauri-apps/plugin-http";

import { onTranscriptReceived } from "@/audio/capture";
import { onJarvisState } from "@/conversation/state-machine";
import { buildIMessageSend, runAppleScript } from "@/actions/applescript";
import type { SendMessageAction } from "@/actions/dispatcher";
import { ttsPlayer } from "@/jarvis-response";
import { loadSettings } from "@/settings";
import { startTask, resolveTask } from "@/hud/background-tasks";

/** Outcome of an actual send. `ok:true` only when the transport confirmed
 *  delivery (a 2xx from the WhatsApp bridge, or AppleScript running clean).
 *  On failure, `reason` is a short machine-ish tag ("unreachable" | `http <n>`)
 *  for logging — the SPOKEN failure line is composed separately, user-friendly. */
interface SendResult {
  ok: boolean;
  reason?: string;
}

/** Spoken affirmatives that release a pending send. */
const AFFIRM_RE =
  /^\s*(?:yes|yeah|yep|yup|sure|ok(?:ay)?|confirm|affirmative|do it|go ahead|send(?: it| that| the message)?|please do|please send(?: it)?)\b/i;
/** Spoken negatives that discard a pending send. */
const NEGATE_RE =
  /^\s*(?:no|nope|nah|cancel|stop|don'?t|do not|never ?mind|nevermind|negative|hold (?:off|on)|scratch that)\b/i;
/** Any negator token anywhere in an utterance. Used by both `hasUnnegatedSendVerb`
 *  and the broadened decline check so the two can never drift apart.
 *  Covers: don't / dont / do not / does not / doesn't / never / not / n't-suffixed contractions.
 *  Leading conversational "no"/"nope"/"nah" are intentionally NOT included here —
 *  those are sentence-initial correction markers (see `hasUnnegatedSendVerb`). */
const NEGATOR_RE = /\b(?:don'?t|do(?:es)?\s+not|doesn'?t|never|not|\w+n't)\b/i;

/** True when the utterance contains an explicit SEND verb ("send it" / "send
 *  that" / "send the message" / "go ahead") that is NOT negated by any negator
 *  token appearing ANYWHERE before it in the utterance. Lets
 *  "no, change it to X and send it" (correction-then-affirm) confirm the
 *  corrected draft (the leading "no" is a correction marker, not a negator token),
 *  while "no, don't send it" / "do not send" / "never send it" stay declines. */
function hasUnnegatedSendVerb(text: string): boolean {
  const sendVerb = /\bsend (?:it|that|this|them|the message|the text)\b|\bgo ahead\b|\bsend\b\s*$/gi;
  for (const m of text.matchAll(sendVerb)) {
    const before = text.slice(0, m.index ?? 0);
    if (!NEGATOR_RE.test(before)) return true;
  }
  return false;
}

/** How fresh a preceding affirmative transcript must be to pre-confirm an
 *  arriving send_message action (two-turn flow). */
const PRECONFIRM_WINDOW_MS = 20_000;
/** Suppress an identical recipient+text send arriving within this window
 *  (the model re-emitting the tool call for a send we already executed). */
const DEDUPE_WINDOW_MS = 30_000;
/** Hard backstop: a pending confirm never outlives this, even if the
 *  conversation somehow stays active. */
const PENDING_TTL_MS = 120_000;
/** Fail-fast timeout on the POST to the WhatsApp bridge. Without this, a dead
 *  or wedged bridge (process crashed, unpaired mid-QR, tunnel down) would leave
 *  the send `fetch` hanging indefinitely — the failure line never speaks, the
 *  conversation FSM never sees a terminal signal, and the whole thing feels
 *  locked up. Eight seconds is the smallest budget that comfortably covers a
 *  healthy bridge on a laptop that just woke from sleep. Anything longer than
 *  this and the user reasonably assumes we broke. */
const WHATSAPP_SEND_TIMEOUT_MS = 8_000;

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

/** Send via WhatsApp: POST to the local whatsapp bridge's /api/send endpoint
 *  (default localhost:8080). Body shape is fixed by the bridge:
 *  { recipient, message }. `recipient` accepts an international-format phone
 *  number OR a chat JID (…@s.whatsapp.net / …@g.us). Returns the true outcome
 *  so the caller can speak an honest terminal line — the send is user-visible,
 *  so silently swallowing a failure would be misleading. */
async function executeWhatsappSend(action: SendMessageAction): Promise<SendResult> {
  let bridgeUrl = "http://localhost:8080";
  try {
    const s = await loadSettings();
    if (s.whatsappBridgeUrl) bridgeUrl = s.whatsappBridgeUrl.replace(/\/$/, "");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[confirm] whatsapp: failed to load bridge URL from settings, using default", err);
  }
  const target = `${bridgeUrl}/api/send`;
  // Bound the request so a dead/hung bridge can never wedge the UI. The
  // AbortController fires at WHATSAPP_SEND_TIMEOUT_MS; on abort the fetch
  // rejects with an AbortError we tag as `reason: "timeout"` so the caller can
  // speak a distinct "may be disconnected" line for it (versus the plain
  // unreachable/HTTP-error cases).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WHATSAPP_SEND_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: action.recipient, message: action.text }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        `[confirm] whatsapp send to "${action.recipient}" failed — bridge returned ${res.status} at ${target}. Is the whatsapp bridge running? See tools/whatsapp-sync/README.md.`,
      );
      return { ok: false, reason: `http ${res.status}` };
    }
    lastSent = { recipient: action.recipient, text: action.text, at: Date.now() };
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] whatsapp send dispatched to "${action.recipient}" (${action.text.length} chars) via ${target}`,
    );
    return { ok: true };
  } catch (err) {
    const aborted = ctrl.signal.aborted || (err as { name?: string })?.name === "AbortError";
    if (aborted) {
      // eslint-disable-next-line no-console
      console.warn(
        `[confirm] whatsapp send to "${action.recipient}" timed out after ${WHATSAPP_SEND_TIMEOUT_MS}ms at ${target}. Bridge is likely wedged or unpaired. See tools/whatsapp-sync/README.md.`,
      );
      return { ok: false, reason: "timeout" };
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[confirm] whatsapp send to "${action.recipient}" failed — could not reach bridge at ${target}. Is the whatsapp bridge running? See tools/whatsapp-sync/README.md.`,
      err,
    );
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Run the actual send. Routes to AppleScript (iMessage) or HTTP bridge
 *  (WhatsApp) based on action.app. Returns the true send outcome. */
async function executeSend(action: SendMessageAction): Promise<SendResult> {
  if (action.app === "whatsapp") {
    return executeWhatsappSend(action);
  }
  const script = buildIMessageSend(action.recipient, action.text);
  try {
    await runAppleScript(script, `send-imessage:${action.recipient}`);
    lastSent = { recipient: action.recipient, text: action.text, at: Date.now() };
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] send_message dispatched to "${action.recipient}" (${action.text.length} chars)`,
    );
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[confirm] send_message to "${action.recipient}" failed`, err);
    return { ok: false, reason: "unreachable" };
  }
}

/** Dispatch a confirmed send and speak the TRUE terminal outcome. On success,
 *  stay silent — the model already spoke the readback/hand-off. On failure,
 *  speak a short, user-appropriate correction (never a dev hint) so the user is
 *  never left believing a false success. */
async function dispatchAndReport(action: SendMessageAction): Promise<void> {
  // Register a HUD loader chip for this in-flight send so the user can see it
  // going out (and keep talking) while it settles. Purely presentational — the
  // chip lives entirely inside this already-detached promise, so it adds no
  // await to the transcript/capture path. Resolves to done/failed below.
  const taskId = startTask({
    kind: "send_message",
    label: `${action.app === "whatsapp" ? "WhatsApp" : "Message"} to ${action.recipient}`,
  });
  const result = await executeSend(action);
  resolveTask(taskId, result.ok ? "done" : "failed");
  if (result.ok) return;
  // A timeout is qualitatively different from "unreachable": the bridge process
  // is up enough to accept a TCP connection but is not answering — almost
  // always a wedged bridge or an unpaired WhatsApp session. Speak a slightly
  // more specific line so the user knows to check pairing/logs rather than
  // assume the bridge is off entirely.
  let failureLine: string;
  if (action.app === "whatsapp") {
    failureLine =
      result.reason === "timeout"
        ? "I couldn't reach WhatsApp, sir. The bridge may be disconnected."
        : "I couldn't reach WhatsApp, sir.";
  } else {
    failureLine = "I couldn't send that, sir.";
  }
  // speakNow synthesizes a one-shot turnId and ends it immediately, so the line
  // is guaranteed to play (previously we passed Date.now() as a "seq" against a
  // global counter that started at 0 — the sentence never matched the expected
  // seq and silently wedged the queue).
  ttsPlayer.speakNow(failureLine);
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
    (AFFIRM_RE.test(lastTranscript.text) || hasUnnegatedSendVerb(lastTranscript.text))
  ) {
    // Two-turn flow: the transcript that triggered this turn was the spoken
    // confirmation. Consume it so it can't confirm anything else.
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] send_message pre-confirmed by preceding affirmative ("${lastTranscript.text}") — sending`,
    );
    lastTranscript = null;
    // Instant client-side ack — the "Sending it now, sir" line used to come
    // from a second model turn ~1min later. The confirm-gate owns the true
    // terminal outcome (success/failure), so speaking the ack here doesn't
    // risk lying to the user.
    ttsPlayer.speakNow("Sending it now, sir.");
    // Fire-and-forget: same load-bearing invariant as resolvePendingWithTranscript.
    // Awaiting here would let a slow/timing-out send freeze the transcript pipeline
    // — the exact wedge the WhatsApp 8s timeout was added to end.
    void dispatchAndReport(action);
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
  // Confirm check runs FIRST so a trailing un-negated send verb in a
  // correction-then-affirm ("no, change it and send it") wins over the leading
  // "no" that refers only to the message wording, not to the send decision.
  if (AFFIRM_RE.test(text) || hasUnnegatedSendVerb(text)) {
    const action = pending.action;
    clearPendingState();
    // eslint-disable-next-line no-console
    console.log(`[confirm] spoken confirmation received ("${text}") — sending`);
    // Instant client-side ack — see the pre-confirm branch above.
    ttsPlayer.speakNow("Sending it now, sir.");
    // Load-bearing fire-and-forget: `clearPendingState()` has already dropped
    // the amber HUD ring and released the pending listeners, so the transcript
    // pipeline is unblocked the moment we return `true`. Never `await` the
    // dispatch here — a slow/timing-out send would freeze input again, which
    // is the exact wedge this unit was created to fix.
    void dispatchAndReport(action);
    return true;
  }
  // Broaden the decline check: NEGATE_RE catches the common sentence-initial
  // negatives ("no", "cancel", "stop", etc.); NEGATOR_RE catches mid-sentence
  // constructions ("never send it", "please don't send it to him") that slip
  // past NEGATE_RE. The confirm branch already returned above for any genuine
  // send, so a remaining negator token unambiguously means decline.
  if (NEGATE_RE.test(text) || NEGATOR_RE.test(text)) {
    discardPending(`user declined ("${text}")`);
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
