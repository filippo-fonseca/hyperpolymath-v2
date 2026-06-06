// apps/desktop/src/main.ts
// Webview entrypoint.
//
// On boot:
//   1. Subscribe to physical SSE so wake events route into cpal capture
//   2. Fire an immediate voice-source claim so the browser sees `desktopClaimed=true` BEFORE any trigger arrives
//   3. Re-post the claim every 10 s for the daemon's lifetime (CONTEXT.md Decision #6)
//   4. Reflect SSE connection state in the UI
//   5. Reflect capture state (idle / recording / uploading) in the UI
//   6. Show the last transcript sent so the user can verify what reached the web app
//   7. Wire the Cancel button so the user can abort an in-flight capture (audio discarded, nothing reaches the web app)

import { postClaim } from "@/api/client";
import {
  cancelCaptureTurn,
  onCaptureState,
  onTranscriptReceived,
  type CaptureState,
} from "@/audio/capture";
import {
  onSseStatusChange,
  startPhysicalExtenderListener,
  type SseStatus,
} from "@/physical-extender/sse-client";

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
