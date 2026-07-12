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
// Expiry: a pending confirm is discarded by explicit decline/replacement or
// after a hard TTL. Do NOT clear it merely because the FSM reports idle: a
// readback turn can return to idle before the user's first "yep" transcript
// arrives, and that affirmative must still release the send.

import { fetch } from "@tauri-apps/plugin-http";
import {
  classifyWhatsappSendError,
  whatsappSendFailureLine,
  type WhatsappBridgeErrorBody,
  type WhatsappSendTransport,
} from "@hyperpolymath/jarvis-core";

import { onTranscriptReceived } from "@/audio/capture";
import { onJarvisResponseStart } from "@/physical-extender/sse-client";
import { buildIMessageSend, runAppleScript } from "@/actions/applescript";
import { resolveImessageRecipient } from "@/actions/imessage-contacts";
import type { SendMessageAction } from "@/actions/dispatcher";
import { ttsPlayer } from "@/jarvis-response";
import { loadSettings } from "@/settings";
import { startTask, resolveTask } from "@/hud/background-tasks";
import { postWhatsappReceipt } from "@/api/client";

/** Outcome of an actual send. `ok:true` only when the transport confirmed
 *  delivery (a 2xx from the WhatsApp bridge, or AppleScript running clean).
 *  On failure, `reason` is a short machine-ish tag ("unreachable" | `http <n>`)
 *  for logging — the SPOKEN failure line is composed separately, user-friendly. */
interface SendResult {
  ok: boolean;
  reason?: string;
  /** On success, the contact the send was actually delivered to, as resolved by
   *  the transport (the WhatsApp bridge returns the matched contact's full name
   *  — e.g. said "Emir", delivered to "Emir Ahmed"). Used to speak an honest
   *  "Sent to <name>, sir" confirmation so the user is never left guessing
   *  whether — and to whom — a message went. Falls back to what the user said. */
  resolvedRecipient?: string;
  /** On a successful WhatsApp send, the chat JID the bridge actually delivered
   *  to (from its `{ jid }` success body). Lets the widget focus that exact chat
   *  after a confirmed send without a fuzzy name match. Absent for iMessage. */
  resolvedJid?: string;
  /** True when the failure line has ALREADY been spoken by executeSend itself
   *  (e.g. the iMessage recipient couldn't be resolved to a real contact, so a
   *  specific "I couldn't find Rohan, sir" line was said). dispatchAndReport
   *  then skips its generic "I couldn't send that" line to avoid double-speak. */
  spoken?: boolean;
}

/** Spoken affirmatives that release a pending send. */
const AFFIRM_RE =
  /^\s*(?:yes|yeah|yep|yup|sure|ok(?:ay)?|confirm|affirmative|do it|go ahead|send (?:it|that|the message)|please do|please send(?: it)?)\b/i;
/** Spoken negatives that discard a pending send. */
const NEGATE_RE =
  /^\s*(?:no|nope|nah|cancel|stop|don'?t|do not|never ?mind|nevermind|negative|hold (?:off|on)|scratch that)\b/i;
/** Any negator token anywhere in an utterance. Used by both `hasUnnegatedSendVerb`
 *  and the broadened decline check so the two can never drift apart.
 *  Covers: don't / dont / do not / does not / doesn't / never / not / n't-suffixed contractions.
 *  Leading conversational "no"/"nope"/"nah" are intentionally NOT included here —
 *  those are sentence-initial correction markers (see `hasUnnegatedSendVerb`). */
const NEGATOR_RE = /\b(?:don'?t|do(?:es)?\s+not|doesn'?t|never|not|\w+n't)\b/i;

/** A transcript shaped like a message-COMPOSITION REQUEST ("send a message to
 *  Rohan that …", "text Rohan saying …"). Such a phrase describes the send we
 *  are about to hold — it must NEVER count as the spoken confirmation for that
 *  very send (that self-confirmation was the iMessage double-send bug). Genuine
 *  confirmations ("yes", "send it", "go ahead") don't match this shape. */
const REQUEST_RE =
  /\bsend\s+\S+\s+(?:(?:a|an|another)\s+)?(?:message|text)\b|\bsend (?:a|an|another) (?:message|text)\b|\b(?:text|message|dm|whatsapp|imessage|ping|shoot|tell|ask|remind)\s+\S+\b|\b(?:that says|saying|say|tell|remind|ask)\b|:/i;

/** Pre-confirm is only for the two-turn flow where the transcript that caused
 *  the arriving tool call is itself a standalone confirmation. Never scan a
 *  composition request's message body for "send it" / "go ahead": those words
 *  may be the content to send, not permission to send it. */
const STANDALONE_CONFIRM_RE =
  /^\s*(?:yes|yeah|yep|yup|sure|ok(?:ay)?|confirm|affirmative|do it|go ahead|send (?:it|that|the message)|please do|please send(?: it)?)\s*[.!?]*\s*$/i;

/** Normalize a message body for dedupe: drop a trailing "(via Jarvis)" /
 *  "(sent via Jarvis)" signature the model sometimes improvises, collapse
 *  whitespace, lowercase. Two emissions of the same logical send that differ
 *  only by that suffix (or by casing/spacing) then compare equal. */
function normalize(t: string): string {
  return t
    .replace(/\s*\((?:sent )?via jarvis\.?\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when two normalized message bodies are the "same" send: equal, or one a
 *  prefix of the other (covers suffix-only variants like a re-emit that appended
 *  or dropped a signature). */
function sameNormalizedText(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length > 0 && longer.startsWith(shorter);
}

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

export function isStandaloneSendConfirmation(text: string): boolean {
  return STANDALONE_CONFIRM_RE.test(text) && !REQUEST_RE.test(text);
}

/** How fresh a preceding standalone affirmative transcript must be to
 *  pre-confirm an arriving send_message action (two-turn flow). Kept short so
 *  an unrelated prior "yes" cannot linger across turns. */
const PRECONFIRM_WINDOW_MS = 3_000;
/** Suppress an identical recipient+text send arriving within this window
 *  (the model re-emitting the tool call for a send we already executed). */
const DEDUPE_WINDOW_MS = 30_000;
/** Text-independent backstop against the double-send: once a send to a given
 *  (app, recipient) has actually been dispatched, any further send_message for
 *  the SAME target arriving within this window is HELD (normal pending flow),
 *  never pre-confirmed — so a model re-emit riding a stale affirmative can't
 *  fire without a fresh explicit "yes". A legitimately different second message
 *  to the same person still works: the user just confirms it again. */
const DISPATCH_LATCH_MS = 15_000;
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
let lastSent: { app: SendMessageAction["app"]; recipient: string; text: string; at: number } | null =
  null;
/** Text-independent dispatch latch (see DISPATCH_LATCH_MS). Records the last
 *  target we actually dispatched to, regardless of message text, so a re-emit
 *  for the same (app, recipient) can be forced back through the hold flow. */
let lastDispatch: { app: SendMessageAction["app"]; recipient: string; at: number } | null = null;
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

/** How a pending send resolved — drives the confirm-gesture panel's dismissal
 *  flourish (tick vs cross). "sent" covers voice-yes / gesture-approve /
 *  pre-confirm; "cancelled" covers voice-no / gesture-cancel / replacement;
 *  "expired" is the silent TTL backstop. Purely presentational. */
export type ConfirmResolution = "sent" | "cancelled" | "expired";
type ConfirmResolvedListener = (resolution: ConfirmResolution) => void;
const resolvedListeners = new Set<ConfirmResolvedListener>();

export function onConfirmResolved(fn: ConfirmResolvedListener): () => void {
  resolvedListeners.add(fn);
  return () => {
    resolvedListeners.delete(fn);
  };
}

function emitResolved(resolution: ConfirmResolution): void {
  for (const fn of resolvedListeners) fn(resolution);
}

/** Fired after a WhatsApp send is CONFIRMED and successfully delivered by the
 *  bridge. The Studio WhatsApp widget listens (via bridge.ts) to open itself to
 *  the target chat and pulse-highlight the just-sent message. Purely a UX echo —
 *  no gate logic keys off it, and it fires only on `ok:true` from the bridge. */
export interface WhatsappSendConfirmed {
  /** Contact/chat name the bridge resolved to (falls back to the spoken name). */
  recipient: string;
  /** True chat JID the bridge delivered to, when it reported one. */
  jid?: string;
  /** The message text that went out — matched to highlight the bubble. */
  text: string;
}
type WhatsappSendConfirmedListener = (payload: WhatsappSendConfirmed) => void;
const whatsappSendListeners = new Set<WhatsappSendConfirmedListener>();

export function onWhatsappSendConfirmed(fn: WhatsappSendConfirmedListener): () => void {
  whatsappSendListeners.add(fn);
  return () => {
    whatsappSendListeners.delete(fn);
  };
}

function emitWhatsappSendConfirmed(payload: WhatsappSendConfirmed): void {
  for (const fn of whatsappSendListeners) fn(payload);
}

/** Fired once any outgoing message (WhatsApp OR iMessage) is confirmed
 *  delivered by its transport. Transport-agnostic and payload-free: it exists
 *  purely so the HUD can play a subtle "sent" cue at the true dispatch moment.
 *  No gate logic keys off it. */
type MessageSentListener = () => void;
const messageSentListeners = new Set<MessageSentListener>();

export function onMessageSent(fn: MessageSentListener): () => void {
  messageSentListeners.add(fn);
  return () => {
    messageSentListeners.delete(fn);
  };
}

function emitMessageSent(): void {
  for (const fn of messageSentListeners) fn();
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
  // A TTL expiry is a silent backstop (no user answer); everything else here is a
  // deliberate decline. The panel shows a cross for a decline, nothing for expiry.
  const resolution: ConfirmResolution = reason.startsWith("TTL") ? "expired" : "cancelled";
  clearPendingState();
  emitResolved(resolution);
}

/** Best-effort parse of the bridge's JSON error body (it always writes JSON via
 *  writeJSON, but a wedged proxy could return something else — never throw). */
async function readBridgeErrorBody(res: Response): Promise<WhatsappBridgeErrorBody> {
  try {
    const parsed = (await res.json()) as unknown;
    if (parsed && typeof parsed === "object") return parsed as WhatsappBridgeErrorBody;
  } catch {
    // Non-JSON / empty body — fall through to an empty classification input.
  }
  return {};
}

/** Speak the honest, category-specific failure line for a WhatsApp send that
 *  did not go through, and return a spoken:true SendResult so dispatchAndReport
 *  does not stack a generic "couldn't reach WhatsApp" line on top. This is the
 *  crux of the bug fix: a contact-resolution failure (not_found / ambiguous)
 *  from a LIVE bridge is NEVER reported as "WhatsApp not connected". */
function reportWhatsappFailure(
  action: SendMessageAction,
  transport: WhatsappSendTransport,
  status: number | undefined,
  body: WhatsappBridgeErrorBody | undefined,
): SendResult {
  const classification = classifyWhatsappSendError(transport, status, body);
  const line = whatsappSendFailureLine(classification, action.recipient);
  // eslint-disable-next-line no-console
  console.warn(
    `[confirm] whatsapp send to "${action.recipient}" failed — category=${classification.category}` +
      ` transport=${transport}${status ? ` status=${status}` : ""}` +
      `${body?.error ? ` bridgeError="${body.error}"` : ""}`,
  );
  ttsPlayer.speakNow(line);
  return { ok: false, reason: classification.category, spoken: true };
}

/** Send via WhatsApp: POST to the local whatsapp bridge's /api/send endpoint
 *  (default localhost:8080). Body shape is fixed by the bridge:
 *  { recipient, message }. `recipient` accepts a contact NAME, an
 *  international-format phone number, OR a chat JID (…@s.whatsapp.net / …@g.us);
 *  the bridge resolves names (fuzzy/partial/alias) server-side. Returns the
 *  true outcome so the caller can speak an honest terminal line — the send is
 *  user-visible, so silently swallowing a failure would be misleading. */
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
  // rejects with an AbortError classified as a connectivity failure (the
  // bridge is unreachable/wedged), distinct from a resolution failure.
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
      // A non-2xx from a LIVE bridge: read the tagged body and classify. A
      // 400 not_found/ambiguous stays a resolution failure; only 5xx / a
      // not_connected code becomes a connectivity line.
      const body = await readBridgeErrorBody(res);
      return reportWhatsappFailure(action, "http_error", res.status, body);
    }
    // Read the bridge's success body for the resolved contact name. The bridge
    // returns { ok, recipient, jid }; `recipient` is the matched contact's full
    // name (empty for raw JID/number sends). Never throw on a malformed body —
    // fall back to what the user said.
    let resolvedRecipient = action.recipient;
    let resolvedJid: string | undefined;
    try {
      const body = (await res.json()) as { recipient?: unknown; jid?: unknown };
      if (typeof body?.recipient === "string" && body.recipient.trim()) {
        resolvedRecipient = body.recipient.trim();
      }
      if (typeof body?.jid === "string" && body.jid.trim()) {
        resolvedJid = body.jid.trim();
      }
    } catch {
      // Non-JSON / empty success body — keep the spoken recipient.
    }
    lastSent = { app: action.app, recipient: action.recipient, text: action.text, at: Date.now() };
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] whatsapp send dispatched to "${action.recipient}" → "${resolvedRecipient}" (${action.text.length} chars) via ${target}`,
    );
    return { ok: true, resolvedRecipient, resolvedJid };
  } catch (err) {
    const aborted = ctrl.signal.aborted || (err as { name?: string })?.name === "AbortError";
    if (aborted) {
      return reportWhatsappFailure(action, "timeout", undefined, undefined);
    }
    return reportWhatsappFailure(action, "unreachable", undefined, undefined);
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
  // Resolve the recipient to a CONCRETE handle before building the AppleScript.
  // Messages.app `send … to participant "<recipient>"` takes the string
  // literally: a bare NAME ("Rohan") gets silently mapped to some arbitrary
  // buddy — the exact bug where a text went to a random contact. We resolve the
  // name via macOS Contacts (authoritative) with recent-thread handles as the
  // tie-breaker/fallback. If we can't land on exactly one confident handle we
  // ABORT and speak an honest line rather than sending to a guess. This runs
  // at SEND time, AFTER spoken confirmation — the confirm gate is untouched.
  let sendHandle = action.recipient;
  const resolution = await resolveImessageRecipient(action.recipient);
  switch (resolution.kind) {
    case "passthrough":
      sendHandle = resolution.handle;
      break;
    case "resolved":
      sendHandle = resolution.handle;
      // eslint-disable-next-line no-console
      console.log(
        `[confirm] resolved iMessage recipient "${action.recipient}" → "${resolution.handle}"`,
      );
      break;
    case "ambiguous": {
      // eslint-disable-next-line no-console
      console.warn(
        `[confirm] ambiguous iMessage recipient "${resolution.name}" (${resolution.candidates.length} candidates) — aborting send`,
      );
      ttsPlayer.speakNow(
        `I found more than one ${resolution.name}, sir. Which number should I use?`,
      );
      return { ok: false, reason: "ambiguous", spoken: true };
    }
    case "no_contacts_permission": {
      // eslint-disable-next-line no-console
      console.warn(
        `[confirm] Contacts access not granted — cannot resolve "${resolution.name}"; aborting send`,
      );
      ttsPlayer.speakNow(
        `I can't check your contacts, sir. Grant Contacts access so I can find ${resolution.name}.`,
      );
      return { ok: false, reason: "no_contacts_permission", spoken: true };
    }
    case "not_found": {
      // eslint-disable-next-line no-console
      console.warn(
        `[confirm] iMessage recipient "${resolution.name}" not found in contacts or recent threads — aborting send`,
      );
      ttsPlayer.speakNow(
        `I couldn't find ${resolution.name} in your contacts, sir.`,
      );
      return { ok: false, reason: "not_found", spoken: true };
    }
  }
  const script = buildIMessageSend(sendHandle, action.text);
  try {
    await runAppleScript(script, `send-imessage:${sendHandle}`);
    lastSent = { app: action.app, recipient: action.recipient, text: action.text, at: Date.now() };
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] send_message dispatched to "${action.recipient}" (${action.text.length} chars)`,
    );
    return { ok: true, resolvedRecipient: action.recipient };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[confirm] send_message to "${action.recipient}" failed`, err);
    return { ok: false, reason: "unreachable" };
  }
}

/** Dispatch a confirmed send and speak the TRUE terminal outcome. On success,
 *  speak a short confirmation naming the contact actually delivered to ("Sent to
 *  Emir Ahmed, sir") — the read-back the user asked for, and the only signal
 *  that distinguishes a real send from a silent non-delivery. On failure, speak
 *  a category-appropriate correction (never a dev hint) so the user is never
 *  left believing a false success. */
async function dispatchAndReport(action: SendMessageAction): Promise<void> {
  // Arm the text-independent dispatch latch the instant we commit to sending.
  // Set here (not at the call sites) so EVERY path that dispatches — the
  // pre-confirm branch and resolvePendingWithTranscript both funnel through
  // here — records the target, and a same-target re-emit within
  // DISPATCH_LATCH_MS is forced back through the hold flow (see holdSendMessage).
  lastDispatch = {
    app: action.app,
    recipient: action.recipient.toLowerCase(),
    at: Date.now(),
  };
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
  if (result.ok) {
    // Subtle "sent" cue at the true dispatch moment, for both transports.
    emitMessageSent();
    // Speak an honest, terminal delivery confirmation naming the contact the
    // message ACTUALLY went to. Before this, success was silent — the user had
    // no way to know a send succeeded (or, worse, that a resolved-but-wrong or
    // undeliverable recipient had silently failed). Naming the resolved contact
    // ("Sent to Emir Ahmed, sir") also confirms the RIGHT person was chosen
    // when the spoken name was a partial/nickname.
    const who = (result.resolvedRecipient ?? action.recipient).trim() || action.recipient;
    ttsPlayer.speakNow(`Sent to ${who}, sir.`);
    // UX echo (WhatsApp only): tell the Studio widget to open THIS chat and
    // pulse the just-sent message. Fires only on a confirmed, delivered send —
    // never gates or blocks the send path.
    if (action.app === "whatsapp") {
      emitWhatsappSendConfirmed({
        recipient: who,
        ...(result.resolvedJid ? { jid: result.resolvedJid } : {}),
        text: action.text,
      });
      // Teach the server what actually happened so a following "did you send
      // it?" voice turn is grounded (buildRecentHistory reads jarvis_turns).
      // Fire-and-forget — the send already succeeded and was spoken.
      void postWhatsappReceipt({
        recipient: who,
        ...(result.resolvedJid ? { jid: result.resolvedJid } : {}),
        text: action.text,
        success: true,
      });
    }
    return;
  }
  // Failure path. For WhatsApp, still record a receipt so the agent knows the
  // send did NOT go through — otherwise the next turn would only see the model's
  // pre-send prose and might claim success. iMessage failures aren't yet mirrored
  // (no widget/receipt plumbing); WhatsApp is the reported case.
  if (action.app === "whatsapp") {
    void postWhatsappReceipt({
      recipient: (result.resolvedRecipient ?? action.recipient).trim() || action.recipient,
      ...(result.resolvedJid ? { jid: result.resolvedJid } : {}),
      text: action.text,
      success: false,
    });
  }
  // executeSend already spoke a specific, category-appropriate line — for
  // WhatsApp: not-connected vs contact-not-found vs ambiguous (see
  // reportWhatsappFailure); for iMessage: resolution failures. Don't stack a
  // generic failure on top.
  if (result.spoken) return;
  // Only reached for an iMessage transport failure that wasn't already spoken
  // (the AppleScript send itself threw). speakNow synthesizes a one-shot turnId
  // and ends it immediately, so the line is guaranteed to play.
  ttsPlayer.speakNow("I couldn't send that, sir.");
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

  // Normalized dedupe: same channel + recipient (case-insensitive) + "same"
  // body within the window. `normalize` strips a trailing "(via Jarvis)"
  // signature and casing/spacing, and `sameNormalizedText` also treats a
  // prefix match as a dup — so a re-emit that only appended/dropped that suffix
  // is still caught (the exact-match dedupe used to miss it, which is how the
  // second iMessage got out).
  if (
    lastSent &&
    lastSent.app === action.app &&
    lastSent.recipient.toLowerCase() === action.recipient.toLowerCase() &&
    sameNormalizedText(normalize(lastSent.text), normalize(action.text)) &&
    now - lastSent.at < DEDUPE_WINDOW_MS
  ) {
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] duplicate send_message to "${action.recipient}" suppressed — already sent ${now - lastSent.at}ms ago`,
    );
    return;
  }

  // Dispatch latch (text-independent backstop): if we ALREADY dispatched to
  // this same (app, recipient) moments ago, a fresh send_message for the same
  // target is almost certainly the model re-emitting the tool call after the
  // user's "yes" (the documented flow-1 hazard). Force it back through the hold
  // flow — never let it pre-confirm off a stale affirmative — so it takes a new
  // explicit "yes". A genuinely different second message to the same person
  // still works: it just holds and the user confirms again.
  const latched =
    lastDispatch !== null &&
    lastDispatch.app === action.app &&
    lastDispatch.recipient === action.recipient.toLowerCase() &&
    now - lastDispatch.at < DISPATCH_LATCH_MS;
  if (latched) {
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] dispatch latch active for "${action.recipient}" (${now - (lastDispatch?.at ?? now)}ms ago) — holding re-emit for a fresh confirmation`,
    );
  }

  if (
    !latched &&
    lastTranscript &&
    now - lastTranscript.at < PRECONFIRM_WINDOW_MS &&
    isStandaloneSendConfirmation(lastTranscript.text)
  ) {
    // Two-turn flow: the transcript that triggered this turn was the spoken
    // confirmation. Consume it so it can't confirm anything else.
    // eslint-disable-next-line no-console
    console.log(
      `[confirm] send_message pre-confirmed by preceding affirmative ("${lastTranscript.text}") — sending`,
    );
    lastTranscript = null;
    // No client-side ack here: the model's tight readback/confirm line IS the
    // single spoken confirmation and it renders in the transcript. An extra
    // ttsPlayer.speakNow ack (a latency band-aid from when the model's reply
    // came ~1min late) played as untranscribed audio that collided with the
    // model's own line — the "weird background voice". Latency is fixed now.
    // The confirm-gate still owns the true terminal FAILURE line below.
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

/** True while a send_message is held awaiting a yes/no answer. Lets a gesture
 *  consumer (thumbs-up/down) know whether there's anything to answer without
 *  reaching into the module's internals. */
export function hasPendingSend(): boolean {
  return pending !== null;
}

/**
 * Programmatically CONFIRM the pending send — the non-voice answer path (a
 * thumbs-up gesture, or any future UI affordance). Equivalent to the user saying
 * "yes": it dispatches the held send and clears the pending. Returns true when a
 * pending existed and was dispatched, false when there was nothing to confirm.
 * Voice confirmation stays valid simultaneously — whichever answer lands first
 * clears the pending, and the other becomes a no-op.
 */
export function confirmPendingSend(): boolean {
  if (!pending) return false;
  const action = pending.action;
  clearPendingState();
  emitResolved("sent");
  // eslint-disable-next-line no-console
  console.log("[confirm] gesture confirmation (thumbs-up) received — sending");
  // Load-bearing fire-and-forget, exactly as the transcript path: clearing the
  // pending has already dropped the amber HUD ring, so nothing waits on the send.
  void dispatchAndReport(action);
  return true;
}

/**
 * Programmatically CANCEL the pending send — the non-voice decline path (a
 * thumbs-down gesture). Equivalent to the user saying "no". Returns true when a
 * pending existed and was discarded, false when there was nothing to cancel.
 */
export function cancelPendingSend(): boolean {
  if (!pending) return false;
  discardPending("gesture cancellation (thumbs-down)");
  return true;
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
    emitResolved("sent");
    // eslint-disable-next-line no-console
    console.log(`[confirm] spoken confirmation received ("${text}") — sending`);
    // No client-side ack here — see the pre-confirm branch above. The model's
    // own confirmation line is the single spoken confirmation; an extra
    // untranscribed ack is the "weird background voice" collision.
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
 * Pending sends intentionally survive raw FSM idle; the TTL is the backstop.
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

  onJarvisResponseStart(() => {
    // New response turn boundary. Tool-call SSE can arrive before the desktop's
    // transcript callback for the same turn, so never let a prior turn's
    // affirmative pre-confirm a newly arriving destructive action.
    lastTranscript = null;
  });

  // eslint-disable-next-line no-console
  console.log("[confirm] send_message confirm gate armed");
}
