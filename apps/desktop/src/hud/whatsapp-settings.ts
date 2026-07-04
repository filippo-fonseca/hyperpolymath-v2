// apps/desktop/src/hud/whatsapp-settings.ts
// Wiring for the "WhatsApp" section of the settings drawer (index.html).
//
//   #wa-reconnect  → invokes the whatsapp_reconnect Tauri command
//                    (whatsapp.rs) → bridge POST /api/logout → sidecar exits
//                    → supervisor pump respawns → existing whatsapp-qr overlay
//                    lights up on its own. Zero new QR rendering.
//   #wa-status     → cosmetic pill driven by the existing whatsapp-qr /
//                    whatsapp-ready events, seeded once from the bridge's
//                    /api/health so first-open state is honest.
//
// Same live-apply pattern as the other settings sections wired from boot().

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import type { DesktopSettings } from "@/settings";

type StatusTone = "muted" | "ok" | "warn" | "err";

const TONE_COLORS: Record<StatusTone, string> = {
  muted: "var(--muted)",
  // Reuse the "connected" green (mirrors sse-status ok) if the CSS var exists;
  // else fall back to a mid-green. The pill is purely cosmetic.
  ok: "var(--ok, #6ecb8f)",
  warn: "var(--warn, #d3a24a)",
  err: "var(--err, #e5736b)",
};

function setStatus(el: HTMLElement, text: string, tone: StatusTone = "muted"): void {
  el.textContent = text;
  el.style.color = TONE_COLORS[tone];
}

/** Wire the whole WhatsApp section. Called once from boot(). */
export async function wireWhatsappSettings(settings: DesktopSettings): Promise<void> {
  const btn = document.getElementById("wa-reconnect");
  const statusEl = document.getElementById("wa-status");
  if (!(btn instanceof HTMLButtonElement) || !(statusEl instanceof HTMLElement)) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp-settings] elements missing; skipping WhatsApp settings wiring");
    return;
  }

  const bridgeUrl = settings.whatsappBridgeUrl.replace(/\/$/, "");

  // Event-driven pill. The Rust side already emits these events for the QR
  // overlay; we ride the same signals for the status text.
  void listen<string>("whatsapp-qr", () => {
    setStatus(statusEl, "scan QR to link", "warn");
  });
  void listen("whatsapp-ready", () => {
    setStatus(statusEl, "connected", "ok");
  });

  // Seed the pill once by asking the bridge directly. Mirrors confirm-gate.ts's
  // pattern (global fetch to http://localhost:8080), which the plugin-http
  // capability already allows. Failure is cosmetic — never blocks the button.
  try {
    const res = await fetch(`${bridgeUrl}/api/health`, { method: "GET" });
    if (res.ok) {
      const body = (await res.json()) as { connected?: boolean; loggedIn?: boolean };
      if (body.connected && body.loggedIn) {
        setStatus(statusEl, "connected", "ok");
      } else if (body.loggedIn) {
        setStatus(statusEl, "reconnecting…", "warn");
      } else {
        setStatus(statusEl, "not linked", "warn");
      }
    } else {
      setStatus(statusEl, `bridge http ${res.status}`, "err");
    }
  } catch {
    setStatus(statusEl, "bridge offline", "err");
  }

  // Button click: fire the Tauri command and reflect state on the pill. The
  // command is idempotent on the bridge side (logout of a device-less store
  // returns "already logged out"), so double-clicks are safe; the disabled
  // flag is just UX polish.
  btn.addEventListener("click", () => {
    const originalLabel = btn.textContent ?? "Reconnect";
    btn.disabled = true;
    btn.textContent = "Reconnecting…";
    setStatus(statusEl, "re-pairing — scan the QR", "warn");
    void invoke<string>("whatsapp_reconnect", { bridgeUrl })
      .then((msg) => {
        // eslint-disable-next-line no-console
        console.log(`[whatsapp-settings] reconnect: ${msg}`);
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(`[whatsapp-settings] reconnect failed: ${reason}`);
        setStatus(statusEl, `reconnect failed: ${reason}`, "err");
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = originalLabel;
      });
  });
}
