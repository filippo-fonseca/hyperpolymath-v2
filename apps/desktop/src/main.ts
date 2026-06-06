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
  onTranscriptReceived,
  startCaptureTurn,
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

function paintCaptureState(state: CaptureState): void {
  const panel = document.getElementById("live-panel");
  const text = document.getElementById("live-text");
  const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement | null;
  if (!panel || !text || !cancelBtn) return;

  panel.setAttribute("data-state", state);
  if (state === "recording") {
    text.textContent = "Recording — speak now";
    cancelBtn.disabled = false;
    cancelBtn.textContent = "Cancel";
  } else if (state === "uploading") {
    text.textContent = "Transcribing…";
    cancelBtn.disabled = true;
    cancelBtn.textContent = "Sent";
  }
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
  el.textContent = peEnabled ? "PE active — using ESP32" : "disabled — using Cmd+Shift+J";
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

const HOTKEY = "CommandOrControl+Shift+J";

/**
 * Register or unregister the global wake-word hotkey based on PE mode.
 * When PE is OFF, Cmd+Shift+J fires startCaptureTurn directly (the keyboard
 * hotkey IS the wake word). When PE is ON, the shortcut is released so
 * ESP32 SSE triggers are the sole wake source.
 */
async function wireGlobalShortcut(peEnabled: boolean): Promise<void> {
  try {
    const alreadyRegistered = await isShortcutRegistered(HOTKEY);
    if (peEnabled) {
      if (alreadyRegistered) {
        await unregisterShortcut(HOTKEY);
        // eslint-disable-next-line no-console
        console.log("[hotkey] PE enabled — Cmd+Shift+J released");
      }
      return;
    }
    if (!alreadyRegistered) {
      await registerShortcut(HOTKEY, (event) => {
        // event.state can be "Pressed" | "Released" on Tauri 2; only act on press.
        if (event.state !== "Pressed") return;
        // eslint-disable-next-line no-console
        console.log("[hotkey] Cmd+Shift+J pressed — firing capture");
        void startCaptureTurn();
      });
      // eslint-disable-next-line no-console
      console.log("[hotkey] PE disabled — Cmd+Shift+J registered");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[hotkey] failed to wire global shortcut", err);
  }
}

async function boot(): Promise<void> {
  // 1. Load persisted settings and apply them before wiring anything.
  const settings = await loadSettings();
  ttsPlayer.setEnabled(settings.ttsEnabled && settings.ttsProvider !== "off");
  ttsPlayer.setVoiceId(settings.ttsVoiceId);
  setPeEnabled(settings.physicalExtenderEnabled);

  // Reflect initial state in UI
  const ttsEnabledEl = document.getElementById("tts-enabled") as HTMLInputElement | null;
  const ttsProviderEl = document.getElementById("tts-provider") as HTMLSelectElement | null;
  const peEnabledEl = document.getElementById("pe-enabled") as HTMLInputElement | null;
  const modeEl = document.getElementById("mode");

  if (ttsEnabledEl) ttsEnabledEl.checked = settings.ttsEnabled;
  if (ttsProviderEl) ttsProviderEl.value = settings.ttsProvider;
  if (peEnabledEl) peEnabledEl.checked = settings.physicalExtenderEnabled;
  if (modeEl) {
    modeEl.textContent = settings.physicalExtenderEnabled ? "physical extender" : "hotkey (Cmd+Shift+J)";
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

  // 4. Wire PE mode toggle
  if (peEnabledEl) {
    peEnabledEl.addEventListener("change", () => {
      const peOn = peEnabledEl.checked;
      setPeEnabled(peOn);
      if (modeEl) {
        modeEl.textContent = peOn ? "physical extender" : "hotkey (Cmd+Shift+J)";
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
