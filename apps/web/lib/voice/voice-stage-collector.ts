/**
 * Phase 9 / TEL-01 — module-level collector for the 3 voice-pipeline
 * timestamps captured in the browser:
 *
 *   - vad_end_at        (captured in JarvisListener.onSpeechEnd as a LOCAL
 *                        value, piped via jarvis-voice-transcript event detail,
 *                        re-constructed and collectStage-d in the consumer
 *                        (GlobalJarvisHandler / JarvisConsole) inside the
 *                        onTurnStart callback AFTER setActiveTurnId.
 *                        NOTE: it CANNOT be collectStage-d directly in
 *                        onSpeechEnd because activeTurnId is not yet set —
 *                        the collector would no-op and vad_end_at would be
 *                        silently dropped on every turn.)
 *   - tts_first_byte_at (useTtsPlayer first chunk arrival)
 *   - audio_first_play_at (AudioQueue first node.start)
 *
 * Pattern: module-level state (no React store) so all 3 capture sites
 * can call collectStage(...) without prop-drilling, identical to
 * lib/voice/mic-state-bus.ts pattern (Phase 7 / CLAUDE.md).
 *
 * Flush trigger: AFTER all 3 stages collected OR when setActiveTurnId
 * rotates to a new turnId (partial flush of the old turn so no data
 * is lost on rapid back-to-back voice turns).
 *
 * Transport: navigator.sendBeacon first (survives page unload), fetch
 * with keepalive:true on fallback (older browsers / sendBeacon=false).
 *
 * Fire-and-forget: NEVER awaited from the caller. NEVER throws to the
 * caller. Telemetry never breaks user flow (Phase 5 pattern).
 */

type VoiceStageName = "vad_end_at" | "tts_first_byte_at" | "audio_first_play_at";

interface PendingTurn {
  turnId: string;
  vadEndAtMs?: number;
  ttsFirstByteAtMs?: number;
  audioFirstPlayAtMs?: number;
}

let activeTurnId: string | null = null;
let pending: PendingTurn | null = null;

const BEACON_PATH = "/api/jarvis/telemetry/voice-stages";

function flush(turn: PendingTurn): void {
  // Skip if no actual stages collected.
  const hasAny =
    turn.vadEndAtMs != null ||
    turn.ttsFirstByteAtMs != null ||
    turn.audioFirstPlayAtMs != null;
  if (!hasAny) return;

  const body = JSON.stringify(turn);

  // Branch 1: sendBeacon (preferred — survives navigation).
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(BEACON_PATH, blob);
      if (ok) return;
    } catch {
      // Fall through to fetch.
    }
  }

  // Branch 2: fetch with keepalive (post-Beacon fallback).
  try {
    void fetch(BEACON_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget — swallow.
    });
  } catch {
    // Telemetry never breaks user flow.
  }
}

/**
 * Bind the next collectStage() calls to this turnId. Call from
 * GlobalJarvisHandler / JarvisConsole inside onTurnStart callback.
 * If a previous turn has un-flushed stages, partial-flush it first.
 */
export function setActiveTurnId(turnId: string): void {
  // Partial flush of the previous turn if any stages were collected.
  if (pending && pending.turnId !== turnId) {
    flush(pending);
  }
  activeTurnId = turnId;
  pending = { turnId };
}

/**
 * Record a single voice-pipeline timestamp against the active turn.
 * No-op when no activeTurnId is set (defensive — text turns never call
 * this; if they accidentally do, nothing happens).
 */
export function collectStage(stage: VoiceStageName, at: Date): void {
  if (!activeTurnId || !pending || pending.turnId !== activeTurnId) return;
  const ms = at.getTime();
  if (stage === "vad_end_at") pending.vadEndAtMs = ms;
  else if (stage === "tts_first_byte_at") pending.ttsFirstByteAtMs = ms;
  else if (stage === "audio_first_play_at") pending.audioFirstPlayAtMs = ms;

  // All 3 collected → flush now (fast path for a clean voice turn).
  if (
    pending.vadEndAtMs != null &&
    pending.ttsFirstByteAtMs != null &&
    pending.audioFirstPlayAtMs != null
  ) {
    flush(pending);
    pending = { turnId: pending.turnId }; // reset so duplicate stage doesn't re-flush
  }
}

/**
 * Force-flush the current pending stages (e.g. on TTS_END if not all 3
 * fired — partial telemetry is better than silent loss). Idempotent.
 */
export function flushNow(): void {
  if (pending) {
    flush(pending);
    pending = pending ? { turnId: pending.turnId } : null;
  }
}

/** Test-only — reset module state between vitest cases. */
export function __resetForTests(): void {
  activeTurnId = null;
  pending = null;
}
