import type { MicState } from "@/lib/voice/mic-state";

/**
 * Module-level pub-sub for the mic FSM state.
 *
 * Lives in its own file so consumers (MicIndicatorDot via PersistentNav)
 * can subscribe WITHOUT importing JarvisListener, which would drag
 * Porcupine + vad-react + onnxruntime-web into the SSR bundle and defeat
 * the dynamic({ ssr: false }) gate in JarvisListenerMount.
 *
 * No global store library — plain Set<>. Single-user MVP, single subscriber
 * in practice (the header dot).
 */

let currentMicState: MicState = "idle";
const stateSubscribers = new Set<(s: MicState) => void>();

export function subscribeToMicState(
  fn: (s: MicState) => void,
): () => void {
  stateSubscribers.add(fn);
  fn(currentMicState);
  return () => {
    stateSubscribers.delete(fn);
  };
}

export function publishMicState(s: MicState): void {
  currentMicState = s;
  stateSubscribers.forEach((fn) => fn(s));
}
