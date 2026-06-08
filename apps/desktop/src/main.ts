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

import { postClaim } from "@/api/client";
import {
  cancelCaptureTurn,
  onCaptureState,
  onExtendedChange,
  onManualModeChange,
  onTranscriptReceived,
  setManualMode,
  setVadSilenceMs,
  startCaptureTurn,
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
  setPeEnabled,
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
    text.textContent = _extended
      ? "Extended — press Ctrl+Option+E to send"
      : "Recording — speak now";
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
  document.body.dataset.jarvisState = state;
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

function paintResponseStart(): void {
  const panel = document.getElementById("response-panel");
  const textEl = document.getElementById("response-text");
  const toolCallsEl = document.getElementById("tool-calls");
  if (!panel || !textEl || !toolCallsEl) return;
  textEl.textContent = "";
  toolCallsEl.innerHTML = "";
  panel.classList.add("streaming");
  panel.classList.add("visible");
}

function paintResponseChunk(delta: string): void {
  const textEl = document.getElementById("response-text");
  if (!textEl) return;
  textEl.textContent = (textEl.textContent ?? "") + delta;
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
  const stopBtn = document.getElementById("stop-btn");
  const idleLabel = document.getElementById("stop-btn-idle");
  if (!stopBtn || !idleLabel) return;
  if (playing) {
    stopBtn.classList.add("visible");
    idleLabel.style.display = "none";
  } else {
    stopBtn.classList.remove("visible");
    idleLabel.style.display = "";
  }
}

let _wakeRegistered = false;
let _extendRegistered = false;

function paintHotkeyStatus(peEnabled: boolean): void {
  const el = document.getElementById("hotkey-status");
  if (!el) return;
  const extLabel = _extendRegistered ? "✓ ⌘⌃E extend" : "✗ ⌘⌃E extend";
  if (peEnabled) {
    el.textContent = `PE active · ${extLabel}`;
    return;
  }
  const wakeLabel = _wakeRegistered ? "✓ ⌘⌃J wake" : "✗ ⌘⌃J wake";
  el.textContent = `${wakeLabel} · ${extLabel}`;
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
  btn.addEventListener("click", () => {
    void startCaptureTurn();
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
    wakeBtn.disabled = state !== "idle";
  }
  if (extendBtn) {
    if (state === "recording") {
      extendBtn.classList.add("visible");
      extendBtn.dataset.extended = isExtended ? "true" : "false";
      extendBtn.innerHTML = isExtended
        ? '✓ Holding — tap to send <span class="shortcut-label">⌘⌃E</span>'
        : '⏸ Hold mic open <span class="shortcut-label">⌘⌃E</span>';
    } else {
      extendBtn.classList.remove("visible");
    }
  }
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
const WAKE_HOTKEY = "Cmd+Ctrl+J";   // wake (only when PE mode is OFF)
const EXTEND_HOTKEY = "Cmd+Ctrl+E"; // toggle extend (always available)

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
 * Register or unregister the wake hotkey based on PE mode.
 * When PE is OFF, Ctrl+Option+J fires startCaptureTurn directly.
 * When PE is ON, the wake hotkey is released — ESP32 SSE triggers handle wake.
 * The extend hotkey is always registered regardless of PE mode.
 */
async function wireGlobalShortcut(peEnabled: boolean): Promise<void> {
  if (peEnabled) {
    await safeUnregister(WAKE_HOTKEY, "wake");
    _wakeRegistered = false;
  } else {
    _wakeRegistered = await safeRegister(WAKE_HOTKEY, "wake", () => void startCaptureTurn());
  }
  paintHotkeyStatus(peEnabled);
}

async function wireExtendShortcut(): Promise<void> {
  _extendRegistered = await safeRegister(EXTEND_HOTKEY, "extend", () => toggleExtended());
}

async function boot(): Promise<void> {
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
    tokenSaveEl.addEventListener("click", async () => {
      const value = tokenInputEl.value.trim();
      if (!value || !value.startsWith("hpd_")) {
        // eslint-disable-next-line no-console
        console.warn("[device-token] token must start with hpd_");
        return;
      }
      await setDeviceToken(value);
      tokenInputEl.value = "";
      paintTokenStatus(value);
    });
  }
  if (tokenClearEl) {
    tokenClearEl.addEventListener("click", async () => {
      await setDeviceToken(null);
      paintTokenStatus(null);
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

  // Drive the kiwi orb state from capture state — idle → recording → uploading → idle.
  // TTS playing is mapped to "speaking" via ttsPlayer.onStateChange below.
  function setJarvisState(s: "idle" | "recording" | "uploading" | "speaking"): void {
    document.body.dataset.jarvisState = s;
  }
  setJarvisState("idle");

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

  // TTS state drives the Stop button visibility + the kiwi orb's "speaking" hue.
  ttsPlayer.onStateChange((state) => {
    paintTtsState(state === "playing");
    if (state === "playing" && _captureState === "idle") {
      setJarvisState("speaking");
    } else if (state === "idle" && _captureState === "idle") {
      setJarvisState("idle");
    }
  });

  onJarvisResponseStart(() => paintResponseStart());
  onJarvisResponseChunk(({ delta }) => paintResponseChunk(delta));
  onJarvisToolCall(({ name, result }) => paintToolCall(name, result));
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

  startPhysicalExtenderListener();

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
