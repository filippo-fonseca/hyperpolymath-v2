// apps/desktop/src/main.ts
// Webview entrypoint.
//
// On boot:
//   1. Subscribe to physical SSE so wake events route into cpal capture
//   2. Fire an immediate voice-source claim so the browser sees `desktopClaimed=true` BEFORE any trigger arrives
//   3. Re-post the claim every 10 s for the daemon's lifetime (CONTEXT.md Decision #6)
//   4. Start the JARVIS response listener so response chunks paint the receipt panel
//   5. Reflect SSE connection state in the UI
//   6. Reflect capture state (idle / recording / uploading) in the UI
//   7. Show the last transcript sent + stream JARVIS response live in the receipt panel
//   8. Wire the Cancel button so the user can abort an in-flight capture

import { postClaim } from "@/api/client";
import {
  cancelCaptureTurn,
  onCaptureState,
  onTranscriptReceived,
  type CaptureState,
} from "@/audio/capture";
import {
  onSseStatusChange,
  onJarvisResponseChunk,
  onJarvisResponseEnd,
  onJarvisResponseStart,
  onJarvisToolCall,
  startPhysicalExtenderListener,
  type SseStatus,
} from "@/physical-extender/sse-client";
import {
  onJarvisResponseComplete,
  startJarvisResponseListener,
  type JarvisResponseComplete,
} from "@/jarvis-response";

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

function wireCancelButton(): void {
  const btn = document.getElementById("cancel-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    void cancelCaptureTurn();
  });
}

async function boot(): Promise<void> {
  onSseStatusChange(paintSseStatus);
  onCaptureState(paintCaptureState);
  onTranscriptReceived(paintTranscript);

  onJarvisResponseStart(() => paintResponseStart());
  onJarvisResponseChunk(({ delta }) => paintResponseChunk(delta));
  onJarvisToolCall(({ name, result }) => paintToolCall(name, result));
  onJarvisResponseEnd(() => {
    // Streaming panel remains visible; response-complete fires shortly after
    // (after the buffer emits). The streaming indicator is cleared there.
  });

  startJarvisResponseListener();
  onJarvisResponseComplete(paintResponseComplete);

  wireCancelButton();

  startPhysicalExtenderListener();

  void postClaim();
  setInterval(() => {
    void postClaim();
  }, CLAIM_HEARTBEAT_MS);

  // eslint-disable-next-line no-console
  console.log(
    "[boot] JARVIS Desktop ready — Physical Extender mode active",
  );
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[boot]", err);
});
