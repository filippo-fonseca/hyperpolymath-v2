// apps/desktop/src/main.ts
// Webview entrypoint.
//
// On boot:
//   1. Subscribe to physical SSE so wake events route into cpal capture
//   2. Fire an immediate voice-source claim so the browser sees `desktopClaimed=true` BEFORE any trigger arrives (closes the first-trigger race — RESEARCH Pitfall 7)
//   3. Re-post the claim every 10 s for the daemon's lifetime — keeps the claim alive across idle gaps (CONTEXT.md Decision #6, planner iteration 1 fix)
//   4. Reflect SSE connection state in the UI

import { postClaim } from "@/api/client";
import {
  onSseStatusChange,
  startPhysicalExtenderListener,
  type SseStatus,
} from "@/physical-extender/sse-client";

const CLAIM_HEARTBEAT_MS = 10_000;

function paintStatus(status: SseStatus): void {
  const el = document.getElementById("sse-status");
  if (!el) return;
  el.textContent =
    status === "connected" ? "connected"
    : status === "error" ? "reconnecting…"
    : "connecting…";
}

async function boot(): Promise<void> {
  onSseStatusChange(paintStatus);
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
