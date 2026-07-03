// apps/desktop/src/briefing/briefing.ts
// Proactive spoken briefing, JARVIS-style. Triggered on wake ("daddy's home").
//
// It POSTs a synthetic text turn to /api/jarvis/voice/text; the backend agent
// (built in parallel) recognizes the briefing intent and streams back a
// proactive spoken briefing over the physicalBus SSE. The existing
// jarvis-response listener + TtsPlayer render and speak it automatically — this
// module just kicks it off and reflects a "briefing" state on the HUD.

import { postText } from "@/api/client";

const BRIEFING_PROMPT = "Daddy's home. Give me my briefing, sir.";

type BriefingStateListener = (active: boolean) => void;
const briefingStateListeners = new Set<BriefingStateListener>();

/** Subscribe to briefing start/stop (for HUD "briefing" cue). */
export function onBriefingState(fn: BriefingStateListener): () => void {
  briefingStateListeners.add(fn);
  return () => {
    briefingStateListeners.delete(fn);
  };
}

function emitBriefingState(active: boolean): void {
  for (const fn of briefingStateListeners) fn(active);
}

/**
 * Fire the proactive briefing turn. Resolves once the POST has been dispatched
 * (the spoken response arrives asynchronously over SSE + TTS). Best-effort: a
 * failed POST is logged and swallowed so wake still proceeds to a command turn.
 *
 * Returns whether the POST was accepted — false means NO spoken response is
 * coming, so callers (the startup sequencer) must not wait for a TTS drain.
 */
export async function runBriefing(): Promise<boolean> {
  emitBriefingState(true);
  try {
    const ok = await postText(BRIEFING_PROMPT);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn("[briefing] briefing POST failed — continuing to command turn");
    }
    return ok;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[briefing] error firing briefing", err);
    return false;
  } finally {
    // The spoken briefing drains over SSE/TTS independently; clear the cue so
    // the HUD returns to its capture-driven states for the command turn.
    emitBriefingState(false);
  }
}
