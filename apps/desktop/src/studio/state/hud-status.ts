/**
 * HUD status store — the live READOUTS the settings surface shows but does not
 * control: the SSE connection state, the resolved invoke mode, the registered
 * hotkey chord, and whether JARVIS is speaking right now.
 *
 * These were rows in the legacy DOM drawer, painted by main.ts straight into
 * `#sse-status` / `#mode` / `#hotkey-status` / `#stop-btn`. The unified surface
 * is React, so main.ts pushes the same values in here instead and the surface
 * subscribes. Status, not settings — nothing here persists.
 *
 * Kept separate from {@link ./desktop-settings} on purpose: these change at
 * connection/speech rate, and a settings slice that re-rendered on every SSE
 * heartbeat would be a poor neighbour.
 */

import { useSyncExternalStore } from "react";

/** Mirrors the SSE lifecycle main.ts already writes to `body[data-sse]`. */
export type SseStatus = "connecting" | "open" | "error";

export interface HudStatus {
  /** SSE connection state. `error` is what reveals the disconnect banner. */
  sse: SseStatus;
  /** Human label for the SSE state (e.g. "connected", "reconnecting in 4s…"). */
  sseDetail: string;
  /** Resolved invoke mode: "physical extender" or the hotkey fallback. */
  mode: string;
  /** The registered chords, e.g. "⌘⌃J wake · ⌘⌃E extend". */
  hotkey: string;
  /** True while TTS is playing — drives the Stop-speaking affordance. */
  speaking: boolean;
}

const INITIAL: HudStatus = {
  sse: "connecting",
  sseDetail: "connecting…",
  mode: "physical extender",
  hotkey: "—",
  speaking: false,
};

let state: HudStatus = INITIAL;

const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

function patch(partial: Partial<HudStatus>): void {
  const next = { ...state, ...partial };
  // Status is pushed on every SSE tick; skip the re-render when nothing moved.
  if (
    next.sse === state.sse &&
    next.sseDetail === state.sseDetail &&
    next.mode === state.mode &&
    next.hotkey === state.hotkey &&
    next.speaking === state.speaking
  ) {
    return;
  }
  state = next;
  emit();
}

export function getHudStatus(): HudStatus {
  return state;
}

export function subscribeHudStatus(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function setSseStatus(sse: SseStatus, detail: string): void {
  patch({ sse, sseDetail: detail });
}

export function setInvokeMode(mode: string): void {
  patch({ mode });
}

export function setHotkeyLabel(hotkey: string): void {
  patch({ hotkey });
}

export function setSpeaking(speaking: boolean): void {
  patch({ speaking });
}

export function useHudStatus(): HudStatus {
  return useSyncExternalStore(subscribeHudStatus, getHudStatus, getHudStatus);
}
