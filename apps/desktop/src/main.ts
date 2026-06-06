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
  onTranscriptReceived,
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
}

function paintExtended(active: boolean): void {
  _extended = active;
  renderLivePanel();
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

function paintHotkeyStatus(peEnabled: boolean): void {
  const el = document.getElementById("hotkey-status");
  if (!el) return;
  el.textContent = peEnabled
    ? "PE active — ESP32 wake · ⌃⌥E to extend"
    : "⌃⌥J wake · ⌃⌥E extend";
}

function wireCancelButton(): void {
  const btn = document.getElementById("cancel-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    void cancelCaptureTurn();
  });
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
// tauri-plugin-global-shortcut accepts. Avoided Cmd+Shift+J because Chrome,
// Safari, and several extensions claim it on macOS (opens Downloads, etc.) —
// even when "registration" appears to succeed, the OS routes the key to the
// other app first. Ctrl+Option combos are rarely grabbed by user-facing apps.
const WAKE_HOTKEY = "Ctrl+Alt+J";   // wake (only when PE mode is OFF)
const EXTEND_HOTKEY = "Ctrl+Alt+E"; // toggle extend (always available)

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
    return;
  }
  await safeRegister(WAKE_HOTKEY, "wake", () => void startCaptureTurn());
}

async function wireExtendShortcut(): Promise<void> {
  await safeRegister(EXTEND_HOTKEY, "extend", () => toggleExtended());
}

async function boot(): Promise<void> {
  // 1. Load persisted settings and apply them before wiring anything.
  const settings = await loadSettings();
  ttsPlayer.setEnabled(settings.ttsEnabled && settings.ttsProvider !== "off");
  ttsPlayer.setVoiceId(settings.ttsVoiceId);
  setPeEnabled(settings.physicalExtenderEnabled);
  setVadSilenceMs(settings.vadSilenceMs);

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

  // TTS state drives the Stop button visibility.
  ttsPlayer.onStateChange((state) => paintTtsState(state === "playing"));

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
