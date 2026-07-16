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
import { fetch } from "@tauri-apps/plugin-http";

import type { DesktopSettings } from "@/settings";

type StatusTone = "muted" | "ok" | "warn" | "err";

/** Bridge lifecycle state (Phase 1 `/api/health` contract). */
type BridgeState = "connecting" | "connected" | "reconnecting" | "logged_out" | "perm_failure";

/** Shape of the Phase 1 `/api/health` payload. All fields optional so we stay
 *  defensive against an OLD bridge binary that only returns the two legacy
 *  booleans (`connected`/`loggedIn`). */
interface HealthBody {
  connected?: boolean;
  loggedIn?: boolean;
  state?: BridgeState;
  reason?: string;
  lastConnected?: string;
  lastDisconnected?: string;
  degraded?: boolean;
}

/** Resolved UI status derived from a health read (or a fetch failure). */
interface UiStatus {
  text: string;
  tone: StatusTone;
  /** Which reconnect flow the button should offer for this status. */
  action: "reconnect" | "relink";
  /** True when the bridge needs a fresh QR scan (drives the overlay hint). */
  needsQr: boolean;
}

/** Poll cadence while the Settings drawer is open. */
const HEALTH_POLL_MS = 10_000;

/**
 * Map a `/api/health` body to a UI status.
 *
 * Prefers the Phase 1 `state` field. If `state` is ABSENT (old bridge binary),
 * falls back to the legacy `connected`/`loggedIn` booleans so nothing breaks
 * against a non-upgraded bridge.
 */
function statusFromHealth(body: HealthBody): UiStatus {
  // Phase 1 path: authoritative `state` enum.
  if (body.state) {
    switch (body.state) {
      case "connected":
        return { text: "connected", tone: "ok", action: "reconnect", needsQr: false };
      case "connecting":
        return { text: "connecting…", tone: "warn", action: "reconnect", needsQr: false };
      case "reconnecting":
        return { text: "reconnecting…", tone: "warn", action: "reconnect", needsQr: false };
      case "logged_out":
        return {
          text: "not linked — scan QR",
          tone: "warn",
          action: "relink",
          needsQr: true,
        };
      case "perm_failure": {
        // Surface the bridge's reason verbatim (e.g. "stream replaced",
        // "temp-banned until …", "bridge outdated — rebuild").
        const reason = body.reason?.trim();
        return {
          text: reason && reason.length > 0 ? reason : "connection failed",
          tone: "err",
          action: "reconnect",
          needsQr: false,
        };
      }
    }
  }

  // `degraded` keepalive flag (Phase 1) — treat as reconnecting, not offline.
  if (body.degraded) {
    return { text: "reconnecting…", tone: "warn", action: "reconnect", needsQr: false };
  }

  // Legacy fallback: no `state` field → map from the two booleans as before.
  if (body.connected && body.loggedIn) {
    return { text: "connected", tone: "ok", action: "reconnect", needsQr: false };
  }
  if (body.loggedIn) {
    return { text: "reconnecting…", tone: "warn", action: "reconnect", needsQr: false };
  }
  return { text: "not linked", tone: "warn", action: "relink", needsQr: true };
}

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
  const btnEl = document.getElementById("wa-reconnect");
  const statusElRaw = document.getElementById("wa-status");
  if (!(btnEl instanceof HTMLButtonElement) || !(statusElRaw instanceof HTMLElement)) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp-settings] elements missing; skipping WhatsApp settings wiring");
    return;
  }
  // Bind narrowed types into consts the nested closures below can rely on
  // (control-flow narrowing from the guard doesn't propagate into closures).
  const btn: HTMLButtonElement = btnEl;
  const statusEl: HTMLElement = statusElRaw;

  const bridgeUrl = settings.whatsappBridgeUrl.replace(/\/$/, "");

  // The reconnect flow the button currently offers, kept in sync with the last
  // health read. Defaults to a plain reconnect until the first poll resolves.
  let currentAction: UiStatus["action"] = "reconnect";

  /** Adapt the button label to the current bridge state. */
  function labelForAction(action: UiStatus["action"]): string {
    return action === "relink" ? "Re-link (scan QR)" : "Reconnect";
  }

  function applyStatus(status: UiStatus): void {
    setStatus(statusEl, status.text, status.tone);
    currentAction = status.action;
    // Only touch the label when the button is idle — never stomp the transient
    // "Reconnecting…" label mid-click.
    if (!btn.disabled) {
      btn.textContent = labelForAction(status.action);
    }
  }

  // Event-driven pill. The Rust side already emits these events for the QR
  // overlay (whatsapp-qr.ts renders the actual code); we ride the same signals
  // for the status text so first-run pairing stays responsive between polls.
  void listen<string>("whatsapp-qr", () => {
    applyStatus({
      text: "not linked — scan QR",
      tone: "warn",
      action: "relink",
      needsQr: true,
    });
  });
  void listen("whatsapp-ready", () => {
    applyStatus({ text: "connected", tone: "ok", action: "reconnect", needsQr: false });
  });

  // Poll the bridge health on an interval while Settings is open. Prefers the
  // Phase 1 `state` field, falls back to legacy booleans (see statusFromHealth).
  // A fetch failure now means EXCLUSIVELY "no process on :8080" — an accurate
  // "bridge offline". Failure is cosmetic and never blocks the button.
  async function refreshStatus(): Promise<void> {
    // Don't clobber the pill/label while a reconnect is mid-flight.
    if (btn.disabled) return;
    try {
      const res = await fetch(`${bridgeUrl}/api/health`, { method: "GET" });
      if (res.ok) {
        const body = (await res.json()) as HealthBody;
        applyStatus(statusFromHealth(body));
      } else {
        // HTTP served but not OK — the process is up but unhappy. Not "offline".
        applyStatus({
          text: `bridge http ${res.status}`,
          tone: "err",
          action: "reconnect",
          needsQr: false,
        });
      }
    } catch {
      // No response at all → nothing is listening on :8080.
      applyStatus({
        text: "bridge offline",
        tone: "err",
        action: "reconnect",
        needsQr: false,
      });
    }
  }

  await refreshStatus();
  const pollTimer = window.setInterval(() => {
    void refreshStatus();
  }, HEALTH_POLL_MS);
  window.addEventListener("beforeunload", () => {
    window.clearInterval(pollTimer);
  });

  // Button click: fire the Tauri command and reflect state on the pill. The
  // command is idempotent on the bridge side (logout of a device-less store
  // returns "already logged out"), so double-clicks are safe; the disabled
  // flag is just UX polish. The label already reflects the current action
  // (Reconnect vs Re-link) from the latest poll.
  btn.addEventListener("click", () => {
    const relinking = currentAction === "relink";
    const idleLabel = labelForAction(currentAction);
    btn.disabled = true;
    btn.textContent = relinking ? "Re-linking…" : "Reconnecting…";
    setStatus(
      statusEl,
      relinking ? "re-pairing — scan the QR" : "reconnecting…",
      "warn",
    );
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
        btn.textContent = idleLabel;
        // Re-sync immediately so the label/pill reflect the post-action state.
        void refreshStatus();
      });
  });
}
