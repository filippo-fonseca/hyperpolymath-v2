/**
 * WhatsApp bridge health — the status pill's data source.
 *
 * Lifted verbatim in BEHAVIOUR from the old `hud/whatsapp-settings.ts`: prefer
 * the Phase 1 `state` enum, fall back to the legacy `connected`/`loggedIn`
 * booleans so an un-upgraded bridge binary still reads honestly, and treat a
 * total fetch failure as "nothing is listening on the bridge port".
 *
 * What is NOT lifted is the leak. The old module polled every 10s and attached
 * two `listen()` subscriptions that were only ever torn down on `beforeunload`
 * — fine for a drawer wired once at boot, a timer-and-two-listeners-per-open
 * leak for a widget the user opens and closes all day. Here every subscription
 * is owned by the effect and released on unmount, and polling only runs while
 * the surface is actually mounted.
 */

import { useEffect, useRef, useState } from "react";

import { listen } from "@tauri-apps/api/event";
import { fetch } from "@tauri-apps/plugin-http";

import type { Tone } from "./controls";

/** Bridge lifecycle state (Phase 1 `/api/health` contract). */
type BridgeState = "connecting" | "connected" | "reconnecting" | "logged_out" | "perm_failure";

/** Shape of the `/api/health` payload. All fields optional — an OLD bridge
 *  binary returns only the two legacy booleans. */
interface HealthBody {
  connected?: boolean;
  loggedIn?: boolean;
  state?: BridgeState;
  reason?: string;
  degraded?: boolean;
}

export interface WhatsappStatus {
  text: string;
  tone: Tone;
  /** Which reconnect flow the button should offer. */
  action: "reconnect" | "relink";
}

/** Poll cadence while the settings surface is open. */
const HEALTH_POLL_MS = 10_000;

/** Map a `/api/health` body to a UI status. Pure — exported for tests. */
export function statusFromHealth(body: HealthBody): WhatsappStatus {
  // Phase 1 path: the authoritative `state` enum.
  if (body.state) {
    switch (body.state) {
      case "connected":
        return { text: "connected", tone: "ok", action: "reconnect" };
      case "connecting":
        return { text: "connecting…", tone: "warn", action: "reconnect" };
      case "reconnecting":
        return { text: "reconnecting…", tone: "warn", action: "reconnect" };
      case "logged_out":
        return { text: "not linked — scan QR", tone: "warn", action: "relink" };
      case "perm_failure": {
        // Surface the bridge's reason verbatim ("stream replaced", "temp-banned
        // until …", "bridge outdated — rebuild").
        const reason = body.reason?.trim();
        return {
          text: reason && reason.length > 0 ? reason : "connection failed",
          tone: "err",
          action: "reconnect",
        };
      }
    }
  }

  // `degraded` keepalive flag — reconnecting, not offline.
  if (body.degraded) return { text: "reconnecting…", tone: "warn", action: "reconnect" };

  // Legacy fallback: no `state` field → map from the two booleans as before.
  if (body.connected && body.loggedIn) return { text: "connected", tone: "ok", action: "reconnect" };
  if (body.loggedIn) return { text: "reconnecting…", tone: "warn", action: "reconnect" };
  return { text: "not linked", tone: "warn", action: "relink" };
}

const CHECKING: WhatsappStatus = { text: "checking…", tone: "muted", action: "reconnect" };

/**
 * Poll the bridge while mounted, and ride the whatsapp-qr / whatsapp-ready
 * events between polls so first-run pairing stays responsive.
 *
 * `busy` suppresses refreshes while a reconnect is mid-flight, so a poll can't
 * stomp the transient "reconnecting…" label.
 */
export function useWhatsappHealth(
  bridgeUrl: string,
  busy: boolean,
): { status: WhatsappStatus; refresh: () => void } {
  const [status, setStatus] = useState<WhatsappStatus>(CHECKING);

  // Read `busy` from a ref so toggling it never re-runs the effect (which would
  // tear down and re-attach the listeners on every click).
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const base = bridgeUrl.replace(/\/$/, "");

  // A monotonic token: bumping it forces an out-of-band refresh.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    const refreshStatus = async (): Promise<void> => {
      if (busyRef.current) return;
      try {
        const res = await fetch(`${base}/api/health`, { method: "GET" });
        if (!alive) return;
        if (res.ok) {
          setStatus(statusFromHealth((await res.json()) as HealthBody));
        } else {
          // HTTP served but unhappy — the process is up. Not "offline".
          setStatus({ text: `bridge http ${res.status}`, tone: "err", action: "reconnect" });
        }
      } catch {
        // No response at all → nothing is listening on the bridge port.
        if (alive) setStatus({ text: "bridge offline", tone: "err", action: "reconnect" });
      }
    };

    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), HEALTH_POLL_MS);

    // listen() resolves to its own unlisten fn; hold the promises so unmount
    // can await and release them even if it lands mid-subscribe.
    const subs = [
      listen<string>("whatsapp-qr", () => {
        if (alive) setStatus({ text: "not linked — scan QR", tone: "warn", action: "relink" });
      }),
      listen("whatsapp-ready", () => {
        if (alive) setStatus({ text: "connected", tone: "ok", action: "reconnect" });
      }),
    ];

    return () => {
      alive = false;
      window.clearInterval(timer);
      for (const sub of subs) {
        void sub.then((unlisten) => unlisten()).catch(() => {
          // No tauri event bus (debug stage / tests): nothing to release.
        });
      }
    };
  }, [base, nonce]);

  return { status, refresh: () => setNonce((n) => n + 1) };
}
