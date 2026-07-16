// apps/desktop/src/main.ts
// Webview entrypoint.
//
// On boot:
//   1. Load persisted settings from plugin-store; apply to TtsPlayer + PE mode
//   2. Subscribe to physical SSE so wake events route into cpal capture
//   3. Fire an immediate voice-source claim so the browser sees `desktopClaimed=true`
//   4. Re-post the claim every 10 s for the daemon's lifetime
//   5. Start the JARVIS response listener (chunks → TTS + receipt panel)
//   6. Reflect SSE connection state in the UI
//   7. Reflect capture state (idle / recording / uploading) in the UI
//   8. Show last transcript + stream JARVIS response live in the receipt panel
//   9. Wire all settings toggles (TTS enabled, provider, PE mode, Stop button)
//  10. Register global hotkey when PE mode is OFF (Piece 5 / Cmd+Shift+J)

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import { postClaim, postWarmup, clearHistory } from "@/api/client";
import {
  cancelCaptureTurn,
  onCaptureState,
  onExtendedChange,
  onManualModeChange,
  onNoSpeechDetected,
  onTranscriptReceived,
  setManualMode,
  setVadSilenceMs,
  toggleExtended,
  type CaptureState,
} from "@/audio/capture";
import {
  onSseStatusChange,
  onJarvisResponseChunk,
  onJarvisResponseEnd,
  onJarvisResponseStart,
  onJarvisToolCall,
  onPhysicalTranscript,
  startPhysicalExtenderListener,
  reconnectPhysicalExtenderListener,
  stopPhysicalExtenderListener,
  setPeEnabled,
  setTriggerHandler,
  type SseStatus,
} from "@/physical-extender/sse-client";
import {
  onJarvisResponseComplete,
  startJarvisResponseListener,
  ttsPlayer,
  type JarvisResponseComplete,
} from "@/jarvis-response";
import type { VoiceStatus } from "@/audio/tts-player";
import { loadSettings, saveSetting } from "@/settings";
import { getDeviceToken, setDeviceToken } from "@/auth/device-token";
import { describeAction, handleAction, parseAction, routeOpenUrl } from "@/actions/dispatcher";
import { onConfirmPendingChange, onMessageSent, startConfirmGate } from "@/actions/confirm-gate";
import { playSendSound } from "@/studio/sound/studio-sfx";
import { startWhatsappQrOverlay } from "@/hud/whatsapp-qr";
import { wireWhatsappSettings } from "@/hud/whatsapp-settings";
import {
  getJarvisState,
  onJarvisState,
  startConversation,
  startConversationMachine,
  type JarvisState,
} from "@/conversation/state-machine";
import {
  createEchoDedupeState,
  decidePaintEcho,
  type EchoInput,
} from "@/conversation/echo-dedupe";
import {
  createTranscriptState,
  reduceClear,
  reduceReplyDelta,
  reduceReplyStart,
  reduceUserEcho,
  type BubbleId,
  type ReduceResult,
  type RenderOp,
  type TranscriptState,
} from "@/conversation/transcript-order";
import { flashAckStrip, startAckStrip } from "@/hud/ack-strip";
import { startRoutineLoader } from "@/hud/routine-loader";
import { startBackgroundTasksMonitor } from "@/hud/background-tasks";
import { startNotificationAnnouncer } from "@/hud/notification-announcer";
import { wireStartupWakeSettings } from "@/hud/startup-settings";
import {
  refreshIdleLoopForPhrases,
  setHasPhraseTriggers,
  setPhraseMatcher,
  setRoutineFireHandler,
  setWakeEnabled,
  setWakeTriggerHandler,
  setWakeWarmupHandler,
} from "@/wake/wake-probe";
import { safeRegister } from "@/hotkeys/register";
import {
  fireRoutine,
  hasPhraseTriggers,
  matchPhrase,
  refreshRoutines,
  setHotkeySync,
  setRoutineBusyCheck,
  setSchedulerSync,
} from "@/routines/registry";
import { syncHotkeys } from "@/routines/hotkeys";
import { startScheduler, syncTimeRoutines } from "@/routines/scheduler";
import { startStudioBridge } from "@studio/bridge";
import { mountStudio } from "@studio/StudioApp";
import {
  isStudioAvailable,
  openBrowserUrl,
} from "@studio/actions/browser-router";
import { shouldSuppressBriefingEcho } from "@/briefing/briefing";
import { openSettingsWidget } from "@studio/actions/open-settings";

const CLAIM_HEARTBEAT_MS = 10_000;
// Re-fetch the owner's enabled routines on this cadence so the desktop's
// trigger surface (phrase table, hotkeys, time next-runs) tracks web edits.
const ROUTINE_SYNC_INTERVAL_MS = 5 * 60_000;

function paintSseStatus(status: SseStatus): void {
  // Drive the header connection dot (body[data-sse]) + the drawer text row.
  document.body.dataset.sse = status;
  const el = document.getElementById("sse-status");
  if (el) {
    el.textContent =
      status === "connected" ? "connected"
      : status === "error" ? "reconnecting…"
      : "connecting…";
  }
}

// Local cache so paintExtendedState can re-render the recording label
// without losing context about the current capture state.
let _captureState: CaptureState = "idle";
let _extended = false;

function renderLivePanel(): void {
  const panel = document.getElementById("live-panel");
  const text = document.getElementById("live-text");
  const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement | null;
  if (!panel || !text || !cancelBtn) return;

  panel.setAttribute("data-state", _captureState);
  panel.setAttribute("data-extended", _extended ? "true" : "false");

  if (_captureState === "recording") {
    text.textContent = "Listening — press ⌘⌃J or say “Done, JARVIS” to send";
    cancelBtn.disabled = false;
    cancelBtn.textContent = "Cancel";
  } else if (_captureState === "uploading") {
    text.textContent = "Transcribing…";
    cancelBtn.disabled = true;
    cancelBtn.textContent = "Sent";
  }
}

function paintCaptureState(state: CaptureState): void {
  _captureState = state;
  renderLivePanel();
  paintActionRow(state, _extended);
  // NOTE: body[data-jarvis-state] is driven by the conversation FSM
  // (idle/listening/thinking/speaking), NOT by raw capture state. See
  // onJarvisState() wiring in boot().
}

function paintExtended(active: boolean): void {
  _extended = active;
  renderLivePanel();
  paintActionRow(_captureState, active);
}

// ── Transcript region: the scrollable conversation log ─────────────────────
// A turn bubble is appended per user utterance and per JARVIS reply. The reply
// bubble is created on response-start and its body grows as chunks stream. The
// region auto-scrolls to the latest text (only when the user is already near
// the bottom, so a manual scroll-up to re-read isn't yanked away).

function transcriptEl(): HTMLElement | null {
  return document.getElementById("transcript");
}

/** True when the transcript is scrolled near its bottom (auto-follow zone). */
function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
}

function autoScroll(el: HTMLElement, wasNearBottom: boolean): void {
  if (wasNearBottom) el.scrollTop = el.scrollHeight;
}

// Transcript turn-pairing. The user bubble (from local STT) and the JARVIS
// reply bubble (from the SSE `response-start`) can arrive in EITHER order, and
// TWO turns can be live at once (a partial-utterance turn and the full-question
// turn, each with its own server turnId). A single-pair machine mis-ordered
// those overlapping turns; the pure, turnId-keyed reducer in
// conversation/transcript-order.ts now owns ALL ordering. This region is a dumb
// executor: it drives the reducer with each event and replays the returned ops
// (create-user / create-reply / append-delta) against the DOM, mapping each
// stable BubbleId to its element. Deltas address a bubble by id, so two live
// reply turns never share a writer (the invariant that was broken before).
const transcriptState = { current: createTranscriptState() };
// Stable BubbleId → { turn container, body element }. The turn container is the
// `.turn` div (positioned in sibling order); the body is the single writer.
const bubbleEls = new Map<BubbleId, { turn: HTMLElement; body: HTMLElement }>();

/** Local wall-clock stamp for a transcript turn, e.g. "5:42 PM". */
function nowStamp(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Build the speaker header row ("you"/"jarvis" + right-aligned timestamp). */
function whoRow(label: string): HTMLElement {
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = label;
  const when = document.createElement("span");
  when.className = "when";
  when.textContent = nowStamp();
  who.appendChild(when);
  return who;
}

/** Create a `.turn` bubble (user or jarvis) and register its body by BubbleId. */
function makeBubble(id: BubbleId, role: "user" | "jarvis", text: string): HTMLElement {
  const turn = document.createElement("div");
  turn.className = `turn ${role}`;
  const who = whoRow(role === "user" ? "you" : "jarvis");
  const body = document.createElement("div");
  body.className = "body";
  if (text) body.textContent = text;
  turn.append(who, body);
  bubbleEls.set(id, { turn, body });
  return turn;
}

/** Replay one RenderOp against the transcript DOM. `beforeId` names the existing
 *  bubble the new one renders ABOVE (null = append at end). */
function applyRenderOp(el: HTMLElement, op: RenderOp): void {
  if (op.op === "append-delta") {
    const target = bubbleEls.get(op.id);
    if (!target) return;
    target.body.textContent = appendWithBoundarySpacing(target.body.textContent ?? "", op.delta);
    return;
  }
  el.classList.add("has-content");
  const turn =
    op.op === "create-user"
      ? makeBubble(op.id, "user", op.text)
      : makeBubble(op.id, "jarvis", "");
  const anchor = op.beforeId ? bubbleEls.get(op.beforeId)?.turn ?? null : null;
  if (anchor) el.insertBefore(turn, anchor);
  else el.appendChild(turn);
}

/** Drive the reducer with an event and paint the resulting ops in order. */
function dispatchTranscript(reduce: (s: TranscriptState) => ReduceResult): void {
  const el = transcriptEl();
  if (!el) return;
  const near = isNearBottom(el);
  const { state, ops } = reduce(transcriptState.current);
  transcriptState.current = state;
  for (const op of ops) applyRenderOp(el, op);
  autoScroll(el, near);
}

// Optimistic user bubble: DISABLED (see the wiring note in boot()). Kept as
// no-ops so the boot()/no-speech references stay valid without reintroducing a
// second, ad-hoc ordering path that could strand a "recognising…" ghost.
function beginOptimisticUserTurn(): void {
  /* intentionally disabled */
}
function clearOptimisticUserTurn(): void {
  /* intentionally disabled */
}

/** Append a streamed delta to the in-progress JARVIS reply bubble. */
function appendWithBoundarySpacing(current: string, delta: string): string {
  if (!current || !delta) return current + delta;
  const last = current.at(-1) ?? "";
  const first = delta.at(0) ?? "";
  if (/\s/.test(last) || /^\s/.test(delta)) return current + delta;
  if (/[.!?]/.test(last) && /[A-Z"']/.test(first)) return `${current} ${delta}`;
  return current + delta;
}

// Dedupe the user-echo paint across its two sources: the early `transcript`
// SSE event (paints at ~STT time, the common/fast path — always carries an
// sttDoneAt identity) and the capture-POST resolution (onTranscriptReceived, a
// fallback that currently arrives text-only). Whichever fires first paints the
// bubble; the OTHER source's echo of the SAME utterance is suppressed so we
// never append a duplicate. The decision lives in the pure decidePaintEcho:
// it dedupes on the per-utterance sttDoneAt identity when present (exact,
// time-independent — so a genuine REPEAT utterance, which carries a fresh id,
// always paints), and falls back to a short text+recency window only for the
// id-less source. Ties break toward painting so a recognised utterance is
// never silently dropped.
const echoDedupeState = createEchoDedupeState();

/**
 * Deduped entry point for the user-echo paint. Both the SSE `transcript` event
 * (with its sttDoneAt) and the POST-driven onTranscriptReceived call route
 * through here; decidePaintEcho drops only a true second echo of the same
 * utterance, never a legitimately new one.
 */
function paintTranscriptDeduped(input: EchoInput, turnId?: string): void {
  // The proactive briefing fires by POSTing a synthetic "Daddy's home…" prompt,
  // which the server echoes back as a user transcript turn. Drop that one echo
  // so wake never injects a fake typed user message into the conversation — the
  // spoken briefing and listening still happen; only the phantom bubble is gone.
  if (shouldSuppressBriefingEcho(input.text)) return;
  if (decidePaintEcho(input, echoDedupeState)) {
    // Thread the reply turnId (when the SSE `transcript` event carried one) so
    // the reducer pairs this user bubble to its reply by identity. The POST
    // fallback source is turnless → FIFO pairing.
    paintTranscript(input.text, turnId);
  }
}

function paintTranscript(text: string, turnId?: string): void {
  if (!text.trim()) return;
  // Route through the pure reducer: a user echo fills the reply-first turn
  // awaiting a user bubble (identity match when a turnId is present, else the
  // oldest turnless one; rendering above that reply), else opens a new
  // user-first turn at the end (recording the turnId so its reply pairs by id).
  dispatchTranscript((s) => reduceUserEcho(s, text, turnId));
  // Keep the drawer QA row in sync.
  const panel = document.getElementById("transcript-panel");
  const out = document.getElementById("transcript-text");
  if (panel && out) {
    out.textContent = text;
    panel.classList.add("visible");
  }
}

function paintResponseStart(turnId: string): void {
  // Open (or bind) this turnId's reply bubble under its own user turn. The
  // reducer is idempotent for a duplicate response-start on the same turnId.
  dispatchTranscript((s) => reduceReplyStart(s, turnId));
  // Drawer QA mirror.
  const panel = document.getElementById("response-panel");
  const textEl = document.getElementById("response-text");
  const toolCallsEl = document.getElementById("tool-calls");
  if (textEl) textEl.textContent = "";
  if (toolCallsEl) toolCallsEl.innerHTML = "";
  if (panel) {
    panel.classList.add("streaming");
    panel.classList.add("visible");
  }
}

function paintResponseChunk(turnId: string, delta: string): void {
  // Deltas route to the bubble keyed by THIS turnId — never a global "current"
  // — so two overlapping reply streams never cross-write.
  dispatchTranscript((s) => reduceReplyDelta(s, turnId, delta));
  // Drawer QA mirror.
  const textEl = document.getElementById("response-text");
  if (textEl) textEl.textContent = appendWithBoundarySpacing(textEl.textContent ?? "", delta);
}

/**
 * Clear the conversation "from scratch". Two halves must both happen:
 *   1. Empty the visible transcript DOM and reset the pure ordering state +
 *      bubble map, so the next utterance starts a clean turn (a stale bubble id
 *      would otherwise route a delta into a removed node).
 *   2. Wipe the server-side memory (jarvis_turns) via clearHistory(), so the
 *      voice agent's recency-windowed context (buildRecentHistory) no longer
 *      inherits stale turns — including test turns fired via curl.
 * The DOM wipe is immediate and never blocks on the network; the server wipe is
 * best-effort and merely disables the button for its round-trip.
 */
async function clearConversation(): Promise<void> {
  const el = transcriptEl();
  if (el) {
    // Remove every turn bubble but keep the static empty-state hint node.
    el.querySelectorAll(".turn").forEach((t) => t.remove());
    el.classList.remove("has-content");
  }
  // Reset the pure ordering state + bubble map so a fresh turn can't reference
  // removed nodes.
  transcriptState.current = reduceClear(transcriptState.current).state;
  bubbleEls.clear();

  // Clear the drawer QA mirrors too, so they don't strand a stale exchange.
  const transcriptText = document.getElementById("transcript-text");
  if (transcriptText) transcriptText.textContent = "";
  const responseText = document.getElementById("response-text");
  if (responseText) responseText.textContent = "";

  const btn = document.getElementById("clear-convo-btn") as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    await clearHistory();
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Append a receipt line to BOTH the pinned footer (most-recent kept, capped)
// and the drawer QA list. Keeps chrome out of the scrollable transcript.
function pushFooterReceipt(text: string, extraClass = ""): void {
  const footer = document.getElementById("tool-calls-footer");
  if (footer) {
    const item = document.createElement("div");
    item.className = `tool-call-item${extraClass ? ` ${extraClass}` : ""}`;
    item.textContent = text;
    footer.appendChild(item);
    // Cap to the last 2 lines so the footer never grows/overlaps.
    while (footer.children.length > 2) footer.removeChild(footer.firstChild!);
  }
}

function paintToolCall(name: string, result: unknown): void {
  const resultOk = (result as { ok?: boolean })?.ok === true;
  const receipt = (result as { receipt?: Record<string, unknown> })?.receipt;
  let summary = `→ ${name}`;
  if (resultOk && receipt) {
    if (name === "create_task") {
      summary = `→ Task: ${String(receipt.title ?? "")}`;
    } else if (name === "create_capture") {
      const content = String(receipt.content ?? "").slice(0, 60);
      summary = `→ Capture: ${content}`;
    } else if (name === "create_event") {
      summary = `→ Event: ${String(receipt.title ?? "")}`;
    }
  }
  pushFooterReceipt(summary);
  // Drawer QA mirror.
  const toolCallsEl = document.getElementById("tool-calls");
  if (toolCallsEl) {
    const item = document.createElement("div");
    item.className = "tool-call-item";
    item.textContent = summary;
    toolCallsEl.appendChild(item);
  }
}

/**
 * Flash a brief "▸ {summary}" receipt line on the HUD when a computer-control
 * action is dispatched (summary comes from describeAction, e.g. "opening
 * Spotify", "message to Emir — awaiting confirmation"). Purely visual — the
 * agent's streamed text already speaks the acknowledgement, so no TTS here.
 */
function flashActionLine(summary: string): void {
  pushFooterReceipt(`▸ ${summary || "…"}`, "action-flash");
  // Drawer QA mirror.
  const toolCallsEl = document.getElementById("tool-calls");
  if (toolCallsEl) {
    const item = document.createElement("div");
    item.className = "tool-call-item action-flash";
    item.textContent = `▸ ${summary || "…"}`;
    toolCallsEl.appendChild(item);
  }
}

function paintResponseComplete(response: JarvisResponseComplete): void {
  const panel = document.getElementById("response-panel");
  if (!panel) return;
  panel.classList.remove("streaming");
  // eslint-disable-next-line no-console
  console.log(
    `[jarvis] response complete — ${response.text.length} chars, ${response.toolCalls.length} tool calls`,
  );
}

function paintTtsState(playing: boolean): void {
  const stopBtn = document.getElementById("stop-btn") as HTMLElement | null;
  const idleLabel = document.getElementById("stop-btn-idle");
  if (!stopBtn || !idleLabel) return;
  stopBtn.style.display = playing ? "inline-flex" : "none";
  idleLabel.style.display = playing ? "none" : "";
}

/**
 * Toggle the "voice degraded" HUD chip. Shown while ElevenLabs is down and
 * JARVIS is speaking through the local fallback voice; hidden on recovery so
 * silence is never mysterious and a working ElevenLabs never leaves a stale
 * warning up. The reason (key_missing / auth / transient) sharpens the tooltip.
 */
function paintVoiceStatus(status: VoiceStatus): void {
  const el = document.getElementById("voice-degraded");
  if (!el) return;
  if (status.state === "degraded") {
    el.hidden = false;
    const detail =
      status.reason === "key_missing" || status.reason === "auth"
        ? "ElevenLabs key unavailable — using local voice"
        : status.reason === "transient"
          ? "ElevenLabs unreachable — using local voice"
          : "ElevenLabs unavailable — using local voice";
    el.setAttribute("title", detail);
  } else {
    el.hidden = true;
  }
}

let _wakeRegistered = false;
let _extendRegistered = false;

function paintHotkeyStatus(_peEnabled: boolean): void {
  const el = document.getElementById("hotkey-status");
  if (!el) return;
  // Plain labels — no status glyphs. The fallback chain picks a chord
  // that actually registers, so visual ✓/✗ feedback is just noise.
  el.innerHTML = `${prettyHotkey(WAKE_HOTKEY)} wake · ${prettyHotkey(_activeExtendHotkey)} extend`;
  el.removeAttribute("title");
}

function wireCancelButton(): void {
  const btn = document.getElementById("cancel-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    void cancelCaptureTurn();
  });
}

function wireWakeButton(): void {
  const btn = document.getElementById("wake-btn");
  if (!btn) return;
  // The manual "Talk to JARVIS" button is the guaranteed fallback invocation
  // surface. It goes through the conversation FSM like the hotkey and tray.
  btn.addEventListener("click", () => {
    void startConversation();
  });
}

function wireExtendButton(): void {
  const btn = document.getElementById("extend-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    toggleExtended();
  });
}

function paintActionRow(state: CaptureState, isExtended: boolean): void {
  const wakeBtn = document.getElementById("wake-btn") as HTMLButtonElement | null;
  const extendBtn = document.getElementById("extend-btn") as HTMLButtonElement | null;
  if (wakeBtn) {
    // Toggle button: enabled in both idle and recording. Uploading disables it.
    wakeBtn.disabled = state === "uploading";
    const wakeLabel = prettyHotkey(WAKE_HOTKEY);
    if (state === "recording") {
      wakeBtn.innerHTML = `Stop &amp; send <span class="shortcut-label">${wakeLabel}</span>`;
      wakeBtn.dataset.recording = "true";
    } else {
      wakeBtn.innerHTML = `Talk to JARVIS <span class="shortcut-label">${wakeLabel}</span>`;
      wakeBtn.dataset.recording = "false";
    }
  }
  // The extend hotkey/button is now redundant — the open-mic model never
  // auto-ends, so there's nothing to "hold open". Keep it hidden.
  if (extendBtn) {
    extendBtn.classList.remove("visible");
  }
  void isExtended;
}

function wireStopButton(): void {
  const btn = document.getElementById("stop-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    ttsPlayer.stop();
    paintTtsState(false);
  });
}

function wireClearButton(): void {
  const btn = document.getElementById("clear-convo-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    void clearConversation();
  });
}

// Hotkey strings use the electron-accelerator format that
// tauri-plugin-global-shortcut accepts.
//
// Iteration history (lessons in macOS shortcut conflicts):
//   - "Cmd+Shift+J" — Chrome/Safari claim it (opens Downloads).
//   - "Ctrl+Alt+J" — VoiceOver / accessibility can swallow Ctrl+Alt combos.
//   - "Cmd+Alt+Space" — reserved by Finder (opens Finder window with search).
//   - "Cmd+Ctrl+J" / "Cmd+Ctrl+E" — chosen. ⌘⌃ combinations are essentially
//     unclaimed: macOS itself doesn't use Cmd+Control for any system shortcut,
//     and very few apps bind it. Verified against the standard macOS shortcut
//     list and common productivity apps.
//
// Manual buttons in the UI remain as the guaranteed fallback regardless.
// Use Tauri's canonical accelerator format from the plugin docs:
// https://v2.tauri.app/plugin/global-shortcut/  — modifiers spelled out,
// key as KeyX literal. The earlier "Cmd+Ctrl+J" form was getting
// rejected (silent failure) because the parser ambiguates Cmd vs Ctrl.
const WAKE_HOTKEY = "Command+Control+KeyJ";
// Fallback chain — try each in order until one registers. Cmd+Ctrl+E is
// claimed by Slack / Logic / various other apps on common Mac setups; the
// rest are very rarely bound by anything. Whichever wins shows in the
// status row so the user knows which chord to press.
const EXTEND_HOTKEY_CANDIDATES = [
  "Command+Control+KeyE",
  "Command+Control+KeyK",
  "Command+Control+Semicolon",
  "Command+Control+Backslash",
  "Command+Control+Period",
];
let _activeExtendHotkey: string = EXTEND_HOTKEY_CANDIDATES[0] ?? "Command+Control+KeyE";

// Pretty label for a Tauri accelerator — for UI display.
function prettyHotkey(accel: string): string {
  return accel
    .replace(/Command/g, "⌘")
    .replace(/Control/g, "⌃")
    .replace(/Shift/g, "⇧")
    .replace(/Option|Alt/g, "⌥")
    .replace(/Key([A-Z])/g, "$1")
    .replace(/Semicolon/g, ";")
    .replace(/Backslash/g, "\\")
    .replace(/Period/g, ".")
    .replace(/\+/g, "");
}

/**
 * Always register the wake hotkey. Previously this gated on PE mode, which
 * meant new users (default: PE ON) had no working hotkey — the only path
 * was the ESP32, which most laptops don't have plugged in. Now the hotkey
 * fires startCaptureTurn() in both modes; when PE is ON the ESP32 still
 * works through its own SSE trigger path, so the hotkey is just an extra
 * input surface, not a replacement.
 */
async function wireGlobalShortcut(peEnabled: boolean): Promise<void> {
  // Cmd+Ctrl+J is the primary invocation surface, routed through the FSM:
  // idle → begin conversation (brief, then listen); listening → end the turn.
  _wakeRegistered = await safeRegister(WAKE_HOTKEY, "invoke", () => void startConversation());
  paintHotkeyStatus(peEnabled);
}

async function wireExtendShortcut(): Promise<void> {
  // Try each candidate in order; first one to register wins. Surface the
  // actually-active chord in the status row so the user knows what to press.
  for (const candidate of EXTEND_HOTKEY_CANDIDATES) {
    const ok = await safeRegister(candidate, "extend", () => toggleExtended());
    if (ok) {
      _activeExtendHotkey = candidate;
      _extendRegistered = true;
      return;
    }
  }
  _extendRegistered = false;
}

async function boot(): Promise<void> {
  // 0. Audio: TTS now plays natively in Rust (rodio), so there is no webview
  //    AudioContext to prime/resume/recover. `unlock()` is a no-op retained for
  //    API compatibility. The Rust output thread is created lazily on the first
  //    tts_play_pcm and lives for the app's lifetime.

  // 1. Load persisted settings and apply them before wiring anything.
  const settings = await loadSettings();
  ttsPlayer.setEnabled(settings.ttsEnabled && settings.ttsProvider !== "off");
  ttsPlayer.setVoiceId(settings.ttsVoiceId);
  setPeEnabled(settings.physicalExtenderEnabled);
  setVadSilenceMs(settings.vadSilenceMs);
  setManualMode(settings.manualMode);

  // Reflect initial state in UI
  const ttsEnabledEl = document.getElementById("tts-enabled") as HTMLInputElement | null;
  const ttsProviderEl = document.getElementById("tts-provider") as HTMLSelectElement | null;
  const peEnabledEl = document.getElementById("pe-enabled") as HTMLInputElement | null;
  const vadSilenceEl = document.getElementById("vad-silence") as HTMLSelectElement | null;
  const modeEl = document.getElementById("mode");

  if (ttsEnabledEl) ttsEnabledEl.checked = settings.ttsEnabled;
  if (ttsProviderEl) ttsProviderEl.value = settings.ttsProvider;
  if (peEnabledEl) peEnabledEl.checked = settings.physicalExtenderEnabled;
  if (vadSilenceEl) vadSilenceEl.value = String(settings.vadSilenceMs);
  if (modeEl) {
    modeEl.textContent = settings.physicalExtenderEnabled ? "physical extender" : "hotkey (⌃⌥J)";
  }
  paintHotkeyStatus(settings.physicalExtenderEnabled);

  // 1b. Wire device token (Authorization: Bearer hpd_...) for prod auth.
  const tokenInputEl = document.getElementById("device-token-input") as HTMLInputElement | null;
  const tokenStatusEl = document.getElementById("token-status");
  const tokenSaveEl = document.getElementById("device-token-save");
  const tokenClearEl = document.getElementById("device-token-clear");
  const tokenMintLinkEl = document.getElementById("device-token-mint-link") as HTMLAnchorElement | null;
  const paintTokenStatus = (token: string | null) => {
    if (!tokenStatusEl) return;
    if (token) {
      tokenStatusEl.textContent = `✓ ${token.slice(0, 8)}…`;
      tokenStatusEl.style.color = "var(--ok, #5b9d6a)";
    } else {
      tokenStatusEl.textContent = "unauthenticated — paste a token below";
      tokenStatusEl.style.color = "var(--muted)";
    }
  };
  paintTokenStatus(await getDeviceToken());
  if (tokenMintLinkEl) {
    const { apiBaseUrl } = (await import("@/env")).getEnv();
    const mintUrl = `${apiBaseUrl}/settings/desktop`;
    tokenMintLinkEl.href = mintUrl;
    tokenMintLinkEl.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(mintUrl, "_blank");
    });
  }
  if (tokenSaveEl && tokenInputEl) {
    const trySaveToken = async (rawValue: string): Promise<boolean> => {
      const value = rawValue.trim();
      if (!value) return false;
      if (!value.startsWith("hpd_")) {
        if (tokenStatusEl) {
          tokenStatusEl.textContent =
            "invalid token — expected one starting with hpd_";
          tokenStatusEl.style.color = "var(--err, #c45a4a)";
        }
        // eslint-disable-next-line no-console
        console.warn("[device-token] token must start with hpd_");
        return false;
      }
      await setDeviceToken(value);
      tokenInputEl.value = "";
      paintTokenStatus(value);
      // Re-open the SSE stream so the new token authenticates it immediately.
      void reconnectPhysicalExtenderListener();
      // Routines were unfetchable while unauthenticated — sync now that a
      // valid bearer is in place so triggers register without an app restart.
      void refreshRoutines();
      return true;
    };

    tokenSaveEl.addEventListener("click", async () => {
      await trySaveToken(tokenInputEl.value);
    });

    // Auto-save on paste so the user doesn't have to chase a second button.
    // Tiny timeout lets the pasted content land in `.value` first.
    tokenInputEl.addEventListener("paste", () => {
      setTimeout(() => {
        void trySaveToken(tokenInputEl.value);
      }, 0);
    });

    // Enter-to-save while the input has focus.
    tokenInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void trySaveToken(tokenInputEl.value);
      }
    });
  }
  if (tokenClearEl) {
    tokenClearEl.addEventListener("click", async () => {
      await setDeviceToken(null);
      paintTokenStatus(null);
      // Drop the authenticated stream; without a token it would 401 anyway.
      stopPhysicalExtenderListener();
    });
  }

  // 2. Wire TTS enabled toggle
  if (ttsEnabledEl) {
    ttsEnabledEl.addEventListener("change", () => {
      const enabled = ttsEnabledEl.checked;
      const provider = (ttsProviderEl?.value ?? "elevenlabs") as "elevenlabs" | "off";
      ttsPlayer.setEnabled(enabled && provider !== "off");
      void saveSetting("ttsEnabled", enabled);
    });
  }

  // 3. Wire TTS provider selector
  if (ttsProviderEl) {
    ttsProviderEl.addEventListener("change", () => {
      const provider = ttsProviderEl.value as "elevenlabs" | "off";
      const enabled = ttsEnabledEl?.checked ?? true;
      ttsPlayer.setEnabled(enabled && provider !== "off");
      void saveSetting("ttsProvider", provider);
    });
  }

  // 3a. Wire manual-mode toggle + body[data-jarvis-state] for orb animation
  const manualModeEl = document.getElementById("manual-mode") as HTMLInputElement | null;
  if (manualModeEl) {
    manualModeEl.checked = settings.manualMode;
    manualModeEl.addEventListener("change", () => {
      setManualMode(manualModeEl.checked);
      void saveSetting("manualMode", manualModeEl.checked);
    });
  }
  onManualModeChange((active) => {
    if (manualModeEl) manualModeEl.checked = active;
  });

  // 3a-bis. Idle wake-phrase listener ("daddy's home") — OPT-IN, default OFF.
  // The trigger handler is injected (same pattern as setTriggerHandler below)
  // so wake invokes funnel through startConversation(): the startup
  // sequencer's once-per-session and no-briefing-overlap guarantees hold for
  // wake exactly as for the hotkey/tray/button. setWakeEnabled() applies the
  // persisted setting now and is also the LIVE toggle surface the settings
  // pane (hud/startup-settings.ts) calls on every flip — start/stop without
  // an app restart.
  setWakeTriggerHandler(() => void startConversation());

  // 3a-quater. On-wake cache pre-warm. The wake probe fires this the instant a
  // wake phrase is detected (built-in "daddy's home" or a routine phrase), in
  // parallel with the mic-release + FSM handoff, so the first agent turn of the
  // wake→command sequence reads a warm Anthropic 1h prompt cache instead of
  // paying ~45s to create it. Fire-and-forget; never blocks the voice loop.
  setWakeWarmupHandler(() => void postWarmup());

  // 3a-ter. Routine triggers. Wire the injection seams that connect the
  // registry (dispatch + fireRoutine), the wake probe (phrase matching), the
  // hotkey manager, and the time scheduler — all data-driven from the owner's
  // enabled routines fetched over the bearer-authed GET route. Seams avoid
  // module import cycles (same pattern as setWakeTriggerHandler above).
  //   - registry ↔ wake probe: matcher + fire handler + phrase-exists gate
  //   - registry → hotkey manager / scheduler: dispatch-table syncers
  //   - registry ← FSM: half-duplex busy check so a time/hotkey fire defers
  //     while JARVIS is thinking/speaking instead of talking over a turn.
  setPhraseMatcher(matchPhrase);
  setRoutineFireHandler((routineId, type) => void fireRoutine(routineId, type));
  setHasPhraseTriggers(hasPhraseTriggers);
  setHotkeySync((entries) => {
    syncHotkeys(entries);
    // A phrase routine may have just appeared/vanished — re-evaluate whether
    // the idle mic loop should now be running even with the wake toggle off.
    void refreshIdleLoopForPhrases();
  });
  setSchedulerSync(syncTimeRoutines);
  setRoutineBusyCheck(() => {
    const s = getJarvisState();
    return s === "thinking" || s === "speaking";
  });

  // Enable the wake feature AFTER the phrase seams are wired, so the initial
  // shouldRunIdleLoop() check sees any phrase routines. Routines are fetched
  // below once the device token is confirmed present.
  setWakeEnabled(settings.wakeEnabled);

  // 3b. Wire VAD silence dropdown
  if (vadSilenceEl) {
    vadSilenceEl.addEventListener("change", () => {
      const ms = Number(vadSilenceEl.value);
      if (!Number.isFinite(ms)) return;
      setVadSilenceMs(ms);
      void saveSetting("vadSilenceMs", ms);
    });
  }

  // 4. Wire PE mode toggle
  if (peEnabledEl) {
    peEnabledEl.addEventListener("change", () => {
      const peOn = peEnabledEl.checked;
      setPeEnabled(peOn);
      if (modeEl) {
        modeEl.textContent = peOn ? "physical extender" : "hotkey (⌃⌥J)";
      }
      paintHotkeyStatus(peOn);
      void saveSetting("physicalExtenderEnabled", peOn);
      // Global shortcut registration is handled in wireGlobalShortcut below.
      void wireGlobalShortcut(peOn);
    });
  }

  // 5. Register SSE + capture listeners
  onSseStatusChange(paintSseStatus);
  onCaptureState(paintCaptureState);
  // NOTE: optimistic "recognising…" bubble disabled — it could strand when the
  // reply/SSE beat the transcript reconcile, leaving a stuck placeholder. The
  // real transcript paints via onTranscriptReceived below (~1s) instead.
  void beginOptimisticUserTurn;
  onExtendedChange(paintExtended);
  // Primary echo paint: the server emits the transcript over SSE at STT time
  // (~1s), so the user's bubble appears immediately on every turn regardless of
  // when the POST response flushes. The POST-driven onTranscriptReceived below
  // stays as a fallback; paintTranscriptDeduped drops whichever fires second so
  // the same utterance never double-paints.
  onPhysicalTranscript((p) =>
    paintTranscriptDeduped({ text: p.transcript, sttDoneAt: p.sttDoneAt }, p.turnId),
  );
  // POST fallback. Threads the response's sttDoneAt through when the server
  // provides it so identity dedupe works from both sources.
  //
  // WEB FOLLOW-UP (not fixed here — apps/web is owned by another agent): the
  // normal-turn response of app/api/jarvis/voice/transcript/route.ts returns
  // `{ transcript, turnId }` and omits `sttDoneAt` (the SSE `transcript` event
  // and the empty/probe responses DO include it). Adding `sttDoneAt` to that
  // final `Response.json` would give the POST fallback a shared identity too,
  // making the dedupe fully identity-based. Until then the desktop dedupe stays
  // correct via the SSE identity + short-window race guard below.
  onTranscriptReceived((text, sttDoneAt) => paintTranscriptDeduped({ text, sttDoneAt }));
  // Empty / failed STT → flash a butler line through the acknowledge strip so
  // the user gets immediate feedback instead of a silent stall. The strip's
  // own guard keeps this from clobbering a live streaming response.
  onNoSpeechDetected((reason) => {
    clearOptimisticUserTurn();
    flashAckStrip(
      reason === "stt-failed" ? "Sorry sir, transcription failed" : "Didn't catch that, sir",
    );
  });

  // TTS state drives the Stop button visibility. The orb's "speaking" state is
  // owned by the conversation FSM (which reads the same ttsPlayer signal).
  ttsPlayer.onStateChange((state) => {
    paintTtsState(state === "playing");
  });
  // Voice-degraded HUD chip: reflects the ElevenLabs→local-voice fallback.
  ttsPlayer.onVoiceStatusChange((status) => {
    paintVoiceStatus(status);
  });

  onJarvisResponseStart(({ turnId }) => paintResponseStart(turnId));
  onJarvisResponseChunk(({ turnId, delta }) => paintResponseChunk(turnId, delta));
  onJarvisToolCall(({ name, result, turnId }) => {
    paintToolCall(name, result);
    // Computer-control tool results carry an `action` on their result. Key
    // strictly off result.action.kind (fixed contract with the backend agent):
    // execute the action + flash a visual confirmation. TTS is NOT triggered —
    // the streamed response text already speaks the acknowledgement.
    const rawAction = (result as { action?: unknown })?.action;
    const action = parseAction(rawAction);
    if (action) {
      flashActionLine(describeAction(action));
      // URL-LEAK FIX: an open_url must NOT launch the system browser for content
      // JARVIS can show in the in-app browser widget. Route http(s) URLs into
      // the widget whenever Studio is available (deduped per turn against the
      // materialize + studio-action paths); the system opener stays only as the
      // fallback (Studio unavailable) or for non-http schemes (mailto: etc.).
      if (
        action.kind === "open_url" &&
        routeOpenUrl(action.url, { studioAvailable: isStudioAvailable() }) === "widget"
      ) {
        openBrowserUrl(action.url, turnId);
        return;
      }
      // FOCUS RULE (RESEARCH Q4): handleAction opens the URL/app which
      // foregrounds the target. We do NOT set_focus() the HUD after an open —
      // that would yank key focus back from the app the user wants to use. The
      // alwaysOnTop + Accessory HUD floats above without stealing input.
      void handleAction(action);
    }
  });
  onJarvisResponseEnd(() => {
    // Streaming indicator cleared when response-complete fires.
  });

  startJarvisResponseListener();
  onJarvisResponseComplete((response) => {
    paintResponseComplete(response);
    // TTS continues draining async; Stop button visibility is driven by
    // ttsPlayer.onStateChange, not response-complete.
  });

  wireCancelButton();
  wireStopButton();
  wireWakeButton();
  wireClearButton();
  wireExtendButton();

  // Route ESP32 `trigger` events through the conversation FSM so the physical
  // button respects the half-duplex gate (no mic-open while TTS is playing),
  // exactly like the hotkey and tray. Injected here to avoid a circular import
  // (the FSM imports the SSE client for onJarvisResponseStart).
  setTriggerHandler(() => void startConversation());

  void startPhysicalExtenderListener();

  // 5b. Conversation FSM: single source of truth for body[data-jarvis-state]
  //     (idle/listening/thinking/speaking). Wire it up and mirror its state
  //     onto the body so the orb reacts.
  const STATUS_LABEL: Record<JarvisState, string> = {
    idle: "standing by",
    listening: "listening",
    thinking: "working",
    speaking: "speaking",
  };
  onJarvisState((s: JarvisState) => {
    document.body.dataset.jarvisState = s;
    // Update just the status word — the connection dot lives beside it.
    const statusWord = document.getElementById("status-word");
    if (statusWord) statusWord.textContent = STATUS_LABEL[s];
  });
  startConversationMachine();
  document.body.dataset.jarvisState = "idle";

  // 5b-bis. send_message confirm gate: holds any send_message action until a
  // spoken affirmative lands in the continue-listening window (transcript +
  // FSM-state subscriptions live inside the gate). Must start after the FSM
  // so its idle-expiry subscription sees real transitions.
  // Guarded-confirm ring: while a send is held pending, the orb's tick
  // overlay shifts amber (index.html keys off body[data-confirm-pending]).
  // Subscribe before arming the gate so no transition is missed.
  onConfirmPendingChange((confirmPending) => {
    document.body.dataset.confirmPending = confirmPending ? "true" : "false";
  });
  // Subtle "sent" cue when an outgoing message (WhatsApp or iMessage) is
  // confirmed dispatched. Mirrors the web app's send-to-JARVIS effect; gated
  // on the Sound setting inside playSendSound.
  onMessageSent(() => playSendSound());
  startConfirmGate();

  // 5c. Acknowledge strip: auto-fading first-clause echo of each JARVIS
  // utterance under the status line. Subscribes to the same SSE response
  // events painted above; purely presentational.
  startAckStrip();

  // 5c-ter. Routine HUD loader: on a synthesize(+parallel) voice routine ("I'm
  // back home"), render the live progress ring + a ticking source
  // checklist, driven by the jarvis-routine-progress SSE stream. Coexists with
  // the spoken brief (a normal response cycle) without overlapping the transcript.
  startRoutineLoader();

  // 5c-quater. Background-task loader chips: any dispatched action that runs
  // detached async work (a WhatsApp/iMessage send, a screenshot describe, a
  // long AppleScript, a computer-use post) registers a task that renders as a
  // running loader chip (top-right, stacked), resolving to done/failed on its
  // own. Lets you keep talking to JARVIS while sends go out in the background,
  // even several at once. Additive + presentational — the dispatch path stays
  // fire-and-forget.
  startBackgroundTasksMonitor();

  // 5c-quinquies. Incoming-message notification announcer: polls WhatsApp +
  // iMessage for new messages FROM people and, when the "Message notifications"
  // setting is on, surfaces a toast near the orb and opens the relevant chat
  // widget; when "Auto-read aloud" is on it also speaks the message in the
  // butler register (FSM-idle-gated so it never talks over a turn). Additive +
  // fail-safe — a bad poll skips one tick.
  startNotificationAnnouncer();

  // 5d. Settings gear → opens the Settings widget on the studio stage.
  // The gear was previously unclickable (studio layers painted over it and
  // swallowed the hit — fixed by lifting .gear-btn above the studio stack in
  // index.html) and toggled the legacy DOM settings sheet. It now summons the
  // singleton Settings widget so the HUD's settings live in one surface,
  // reachable by mouse AND the synthetic hand pointer (the button is a normal
  // DOM target either driver can land on). The legacy DOM sheet stays wired for
  // its close button and the disconnect banner (device-token recovery).
  const gearBtn = document.getElementById("gear-btn");
  const settingsEl = document.getElementById("settings");
  const settingsCloseBtn = document.getElementById("settings-close");
  gearBtn?.addEventListener("click", () => openSettingsWidget());
  settingsCloseBtn?.addEventListener("click", () => settingsEl?.classList.remove("open"));

  // The disconnect banner (shown only when body[data-sse="error"]) is a shortcut
  // into Settings, where the device token lives — so a dropped server / bad
  // token is both obvious and one tap from being fixed.
  document
    .getElementById("disconnect-banner")
    ?.addEventListener("click", () => settingsEl?.classList.add("open"));

  // 5d-bis. "Startup & Wake" section of the drawer: wake toggle (live), the
  // briefing toggle, and the openOnStart / Shortcuts list editors. All persist
  // via saveSetting immediately on change.
  wireStartupWakeSettings(settings);

  // Tray left-click also invokes a turn (emitted from Rust as `tray-invoke`).
  // "Show / Hide HUD" stays on the right-click menu so visibility toggling is
  // not conflated with invocation.
  void listen("tray-invoke", () => {
    void startConversation();
  });

  // WhatsApp pairing overlay: render the QR the bundled bridge sidecar emits on
  // first run / re-auth, and dismiss it once the phone links the device.
  void startWhatsappQrOverlay();

  // WhatsApp settings section: Reconnect button + status pill. Reuses the
  // whatsapp-qr / whatsapp-ready events for its pill and invokes the
  // whatsapp_reconnect Tauri command to trigger re-pairing.
  void wireWhatsappSettings(settings);

  // Initial global shortcut setup
  await wireGlobalShortcut(settings.physicalExtenderEnabled);
  await wireExtendShortcut();

  void postClaim();
  setInterval(() => {
    void postClaim();
  }, CLAIM_HEARTBEAT_MS);

  // Boot-time cache pre-warm. Fire the Anthropic 1h prompt-cache creation now,
  // once, so the user's FIRST spoken command of the session reads a warm cache
  // (~600ms) instead of paying the ~45s one-time creation on turn 1. Also warms
  // the web's Postgres pool + compiles the voice route. Fire-and-forget — never
  // blocks boot; a warmup miss just means turn 1 pays the old cost.
  void postWarmup();

  // Routine triggers: start the time scheduler, do the initial sync (fetches
  // the owner's enabled routines and rebuilds all dispatch tables), then poll
  // so web-app edits propagate. The initial fetch no-ops gracefully (returns
  // []) if no device token is present yet; the token-save handler above calls
  // refreshRoutines() again the moment a valid bearer lands.
  startScheduler();
  void refreshRoutines();
  setInterval(() => {
    void refreshRoutines();
  }, ROUTINE_SYNC_INTERVAL_MS);

  // 6b. Startup permission probe: without the Accessibility TCC grant, enigo
  // input injection (type_text / press_key / mouse) is a SILENT no-op — the
  // OS reports success and nothing happens. Warn loudly at boot so the
  // failure mode is visible in the console instead of mystifying a demo.
  void invoke<boolean>("accessibility_trusted")
    .then((trusted) => {
      if (trusted) {
        // eslint-disable-next-line no-console
        console.log("[perm] Accessibility: granted — keyboard/mouse injection available");
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          "[perm] Accessibility NOT granted — type_text/press_key/mouse actions will fail. " +
            "Enable JARVIS in System Settings → Privacy & Security → Accessibility. " +
            "(Screen Recording for take_screenshot is a separate TCC-panel grant.)",
        );
      }
    })
    .catch((err) => {
      // Non-fatal — running outside Tauri (plain vite dev) has no command.
      // eslint-disable-next-line no-console
      console.warn("[perm] accessibility probe failed", err);
    });

  // eslint-disable-next-line no-console
  console.log(
    "[boot] JARVIS Desktop ready",
    settings.physicalExtenderEnabled ? "— Physical Extender mode" : "— Hotkey mode (Cmd+Shift+J)",
  );
}

const studioRoot = document.getElementById("studio-root");
if (studioRoot) {
  startStudioBridge();
  mountStudio(studioRoot);
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[boot]", err);
});
