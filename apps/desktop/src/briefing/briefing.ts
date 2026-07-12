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

/**
 * The briefing is fired by POSTing a synthetic prompt to /api/jarvis/voice/text.
 * The server echoes that prompt back as a user transcript turn, which the HUD
 * would otherwise paint into the conversation — a fake "Daddy's home. Give me my
 * briefing, sir." message the user never typed. We don't want the briefing to
 * inject a visible user turn (the wake should just trigger the spoken briefing
 * and listening), so `shouldSuppressBriefingEcho` lets the transcript paint drop
 * that one specific echo while the briefing is in flight. It matches the exact
 * prompt (case-insensitive, whitespace-normalized) so a genuine user utterance
 * that merely resembles it is never swallowed.
 */
function normalizeForEcho(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

const NORMALIZED_BRIEFING_PROMPT = normalizeForEcho(BRIEFING_PROMPT);

/** True while a briefing POST is in flight and hasn't yet been echoed back. */
let briefingEchoPending = false;

/**
 * Called by the transcript paint path. Returns true (and consumes the pending
 * flag) exactly once, for the briefing prompt's own echo, so the synthetic wake
 * turn is never painted. Any other text — or a second identical echo — paints
 * normally.
 */
export function shouldSuppressBriefingEcho(text: string): boolean {
  if (!briefingEchoPending) return false;
  if (normalizeForEcho(text) !== NORMALIZED_BRIEFING_PROMPT) return false;
  briefingEchoPending = false;
  return true;
}

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
  // Arm the echo suppressor BEFORE the POST so the prompt's transcript echo —
  // which can arrive over SSE before the POST resolves — is dropped, not
  // painted as a fake user turn. Auto-disarms after a short window so it can
  // never swallow a later, genuine utterance if no echo arrives.
  briefingEchoPending = true;
  const disarm = setTimeout(() => {
    briefingEchoPending = false;
  }, 12_000);
  try {
    const ok = await postText(BRIEFING_PROMPT);
    if (!ok) {
      briefingEchoPending = false;
      clearTimeout(disarm);
      // eslint-disable-next-line no-console
      console.warn("[briefing] briefing POST failed — continuing to command turn");
    }
    return ok;
  } catch (err) {
    briefingEchoPending = false;
    clearTimeout(disarm);
    // eslint-disable-next-line no-console
    console.warn("[briefing] error firing briefing", err);
    return false;
  } finally {
    // The spoken briefing drains over SSE/TTS independently; clear the cue so
    // the HUD returns to its capture-driven states for the command turn.
    emitBriefingState(false);
  }
}
