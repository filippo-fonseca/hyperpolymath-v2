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

import {
  register as registerShortcut,
  unregister as unregisterShortcut,
  isRegistered as isShortcutRegistered,
} from "@tauri-apps/plugin-global-shortcut";
import { listen } from "@tauri-apps/api/event";

import { postClaim } from "@/api/client";
import {
  cancelCaptureTurn,
  onCaptureState,
  onExtendedChange,
  onManualModeChange,
  onMicAmplitude,
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
import { loadSettings, saveSetting } from "@/settings";
import { getDeviceToken, setDeviceToken } from "@/auth/device-token";
import { handleAction, parseAction } from "@/actions/dispatcher";
import {
  getJarvisState,
  onJarvisState,
  startConversation,
  startConversationMachine,
  type JarvisState,
} from "@/conversation/state-machine";
import { primeAudioOnGesture, wireVisibilityRecovery } from "@/audio/audio-context";
import { mountOrb } from "@/hud/orb";

const CLAIM_HEARTBEAT_MS = 10_000;

function paintSseStatus(status: SseStatus): void {
  const el = document.getElementById("sse-status");
  if (!el) return;
  el.textContent =
    status === "connected" ? "connected"
    : status === "error" ? "reconnecting…"
    : "connecting…";
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

function paintTranscript(text: string): void {
  const panel = document.getElementById("transcript-panel");
  const out = document.getElementById("transcript-text");
  if (!panel || !out) return;
  out.textContent = text;
  panel.classList.add("visible");
}

function setAckLine(text: string): void {
  const ack = document.getElementById("ack-line");
  if (!ack) return;
  ack.textContent = text;
  ack.classList.toggle("visible", text.trim().length > 0);
}

function paintResponseStart(): void {
  const panel = document.getElementById("response-panel");
  const textEl = document.getElementById("response-text");
  const toolCallsEl = document.getElementById("tool-calls");
  // Clear the ack line for the new turn (it fades in as text streams).
  setAckLine("");
  if (!panel || !textEl || !toolCallsEl) return;
  textEl.textContent = "";
  toolCallsEl.innerHTML = "";
  panel.classList.add("streaming");
  panel.classList.add("visible");
}

function paintResponseChunk(delta: string): void {
  const textEl = document.getElementById("response-text");
  const next = (textEl?.textContent ?? "") + delta;
  if (textEl) textEl.textContent = next;
  // Mirror the spoken acknowledgement as one glanceable HUD line (VISION §4).
  setAckLine(next);
}

function paintToolCall(name: string, result: unknown): void {
  const toolCallsEl = document.getElementById("tool-calls");
  if (!toolCallsEl) return;
  const item = document.createElement("div");
  item.className = "tool-call-item";
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
  item.textContent = summary;
  toolCallsEl.appendChild(item);
}

/**
 * Flash a brief "▸ opening {label}" receipt line on the HUD when a
 * computer-control action is dispatched. Purely visual — the agent's streamed
 * text already speaks the acknowledgement, so we do NOT trigger TTS here.
 */
function flashActionLine(label: string): void {
  const toolCallsEl = document.getElementById("tool-calls");
  if (!toolCallsEl) return;
  const item = document.createElement("div");
  item.className = "tool-call-item action-flash";
  item.textContent = `▸ opening ${label || "…"}`;
  toolCallsEl.appendChild(item);
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

async function safeRegister(
  hotkey: string,
  label: string,
  handler: () => void,
): Promise<boolean> {
  try {
    if (await isShortcutRegistered(hotkey)) {
      // eslint-disable-next-line no-console
      console.log(`[hotkey] ${label} (${hotkey}) already registered`);
      return true;
    }
    await registerShortcut(hotkey, (event) => {
      if (event.state !== "Pressed") return;
      // eslint-disable-next-line no-console
      console.log(`[hotkey] ${label} (${hotkey}) pressed`);
      handler();
    });
    // eslint-disable-next-line no-console
    console.log(`[hotkey] ${label} (${hotkey}) registered`);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[hotkey] failed to register ${label} (${hotkey})`, err);
    return false;
  }
}

async function safeUnregister(hotkey: string, label: string): Promise<void> {
  try {
    if (await isShortcutRegistered(hotkey)) {
      await unregisterShortcut(hotkey);
      // eslint-disable-next-line no-console
      console.log(`[hotkey] ${label} (${hotkey}) released`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[hotkey] failed to unregister ${label} (${hotkey})`, err);
  }
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
  // 0. Audio: create + resume the shared AudioContext eagerly so JARVIS speaks
  //    the very first briefing without a click. Belt-and-braces: also resume on
  //    the first pointer/key gesture and recover on foreground.
  ttsPlayer.unlock();
  primeAudioOnGesture();
  wireVisibilityRecovery();

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

  // 3a-bis. The always-on wake loop was retired (invoke-to-talk only). The
  // wake-enabled setting key remains readable for back-compat but no longer
  // drives any live feature.

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
  onExtendedChange(paintExtended);
  onTranscriptReceived(paintTranscript);

  // TTS state drives the Stop button visibility. The orb's "speaking" state is
  // owned by the conversation FSM (which reads the same ttsPlayer signal).
  ttsPlayer.onStateChange((state) => {
    paintTtsState(state === "playing");
  });

  onJarvisResponseStart(() => paintResponseStart());
  onJarvisResponseChunk(({ delta }) => paintResponseChunk(delta));
  onJarvisToolCall(({ name, result }) => {
    paintToolCall(name, result);
    // Computer-control tool results carry an `action` on their result. Key
    // strictly off result.action.kind (fixed contract with the backend agent):
    // execute the action + flash a visual confirmation. TTS is NOT triggered —
    // the streamed response text already speaks the acknowledgement.
    const rawAction = (result as { action?: unknown })?.action;
    const action = parseAction(rawAction);
    if (action) {
      flashActionLine(action.label);
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
    const statusEl = document.getElementById("status-line");
    if (statusEl) statusEl.textContent = STATUS_LABEL[s];
    // Fade the acknowledge line out once JARVIS returns to rest.
    if (s === "idle") setAckLine("");
  });
  startConversationMachine();
  document.body.dataset.jarvisState = "idle";

  // 5c. The single cyan arc-reactor orb (Task 2.4). One component, four states,
  //     live amplitude: mic RMS while listening, TTS output while speaking.
  let latestMicLevel = 0;
  onMicAmplitude((level) => {
    latestMicLevel = level;
  });
  const orbCanvas = document.getElementById("orb-canvas") as HTMLCanvasElement | null;
  if (orbCanvas) {
    mountOrb(orbCanvas, {
      getState: () => getJarvisState(),
      getMicLevel: () => latestMicLevel,
      getSpeakingLevel: () => ttsPlayer.getSpeakingLevel(),
    });
  }

  // 5d. Settings drawer (gear toggle) — chrome stays out of the way by default.
  const gearBtn = document.getElementById("gear-btn");
  const settingsEl = document.getElementById("settings");
  const settingsCloseBtn = document.getElementById("settings-close");
  gearBtn?.addEventListener("click", () => settingsEl?.classList.toggle("open"));
  settingsCloseBtn?.addEventListener("click", () => settingsEl?.classList.remove("open"));

  // Tray left-click also invokes a turn (emitted from Rust as `tray-invoke`).
  // "Show / Hide HUD" stays on the right-click menu so visibility toggling is
  // not conflated with invocation.
  void listen("tray-invoke", () => {
    void startConversation();
  });

  // Initial global shortcut setup
  await wireGlobalShortcut(settings.physicalExtenderEnabled);
  await wireExtendShortcut();

  void postClaim();
  setInterval(() => {
    void postClaim();
  }, CLAIM_HEARTBEAT_MS);

  // eslint-disable-next-line no-console
  console.log(
    "[boot] JARVIS Desktop ready",
    settings.physicalExtenderEnabled ? "— Physical Extender mode" : "— Hotkey mode (Cmd+Shift+J)",
  );
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[boot]", err);
});
