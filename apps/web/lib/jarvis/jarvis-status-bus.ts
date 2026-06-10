import type { HudStatusState } from "@/components/shared/HudStatusPill";

/**
 * Module-level pub-sub for the JARVIS console status (READY/THINKING/…).
 *
 * Mirrors lib/voice/mic-state-bus. The console publishes; the TopTabBar
 * renders the HudStatusPill in the app header so scrollback content can
 * never obscure it. Plain Set<> — single-user MVP, one subscriber.
 */

let currentStatus: HudStatusState = "ready";
const subscribers = new Set<(s: HudStatusState) => void>();

export function subscribeToJarvisStatus(
  fn: (s: HudStatusState) => void,
): () => void {
  subscribers.add(fn);
  fn(currentStatus);
  return () => {
    subscribers.delete(fn);
  };
}

export function publishJarvisStatus(s: HudStatusState): void {
  if (s === currentStatus) return;
  currentStatus = s;
  subscribers.forEach((fn) => fn(s));
}
