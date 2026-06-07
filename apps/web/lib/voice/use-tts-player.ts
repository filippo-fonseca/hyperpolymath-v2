"use client";

import { useRef, useCallback } from "react";
import {
  TurnPlaybackController,
  type TurnPlaybackParams,
} from "./turn-playback-controller";
import type { VoiceSettings } from "./types";

/**
 * Phase 10 Plan 10-04 (LAT-02 + LAT-03) — TTS playback hook.
 *
 * Replaces the Phase 7 single-fetch `play(params)` model with a per-sentence
 * orchestrator backed by TurnPlaybackController held in a useRef. The hook
 * exposes:
 *
 *   - playSentence(text, seq, params): void — dispatch a sentence at the
 *     given sequence index. Lazily instantiates the controller on the first
 *     non-silent call.
 *   - endOfTurn(): void — signal that no more sentences will be dispatched.
 *     The controller fires onEnd once all in-flight fetches drain and the
 *     AudioQueue empties.
 *   - stop(): void — D-04 stop-all. Aborts every in-flight fetch, flushes
 *     the AudioQueue, cancels SpeechSynthesis, and resets the controller
 *     ref so the next turn starts fresh.
 *
 * Fallback chain (D-04, locked in 10-CONTEXT.md):
 *   1. ElevenLabs Flash PCM via /api/jarvis/tts (default)
 *   2. SpeechSynthesis (browser) when:
 *        a) user's settings.ttsProvider === 'browser' (chosen voice mode), OR
 *        b) sentence 0's ElevenLabs fetch fails before any audio plays
 *           (controller flips fallbackVoice → 'browser' for the WHOLE turn —
 *           no mid-turn voice swap).
 *   3. Silence when ttsProvider === 'off' or text is empty.
 *
 * CLAUDE.md no-global-stores: TurnPlaybackController is a CLASS held in a
 * useRef. Not in a React Context. Not in Zustand/XState/any module-level
 * store. Per-turn lifecycle: created on first playSentence, destroyed on
 * endOfTurn() onEnd or stop().
 */

export interface PlaySentenceParams {
  voiceId: string;
  ttsProvider: VoiceSettings["ttsProvider"];
  audioContext: AudioContext;
  onStart: () => void;
  onEnd: () => void;
}

export function useTtsPlayer() {
  const controllerRef = useRef<TurnPlaybackController | null>(null);
  // Track the params used to construct the current controller so endOfTurn /
  // onEnd can reset the ref idempotently. The controller's params.onEnd
  // callback is the right disposal moment, NOT endOfTurn() itself.

  const playSentence = useCallback(
    (text: string, seq: number, params: PlaySentenceParams): void => {
      const { ttsProvider, audioContext, onStart, onEnd } = params;

      // Silence branch — no controller needed. Cycle the FSM on the FIRST
      // sentence only (seq === 0) so onEnd doesn't fire repeatedly per
      // sentence in a multi-sentence silent turn.
      if (ttsProvider === "off" || !text.trim()) {
        if (seq === 0) onEnd();
        return;
      }

      // Lazily instantiate the controller on first call this turn.
      if (!controllerRef.current) {
        const controllerParams: TurnPlaybackParams = {
          voiceId: params.voiceId,
          ttsProvider,
          audioContext,
          onStart,
          // Wrap the caller's onEnd so we can dispose the controller after
          // it fires (the controller is single-turn; the next turn allocates
          // a fresh one).
          onEnd: () => {
            try {
              onEnd();
            } finally {
              controllerRef.current = null;
            }
          },
          // ttsProvider === 'browser' → route every sentence through
          // SpeechSynthesis from the start (no ElevenLabs attempt at all).
          forceFallback: ttsProvider === "browser",
        };
        controllerRef.current = new TurnPlaybackController(controllerParams);
      }

      // Fire-and-forget — the controller manages its own async lifecycle.
      void controllerRef.current.playSentence(text, seq);
    },
    [],
  );

  /**
   * Signal end-of-turn. The controller's onEnd will fire once all in-flight
   * fetches drain and the AudioQueue empties. The wrapper installed in
   * playSentence then disposes the controller ref.
   */
  const endOfTurn = useCallback((): void => {
    controllerRef.current?.endOfTurn();
  }, []);

  /**
   * Stop all audio immediately. D-04 stop-all: aborts every in-flight fetch,
   * flushes the AudioQueue, cancels SpeechSynthesis, fires the controller's
   * onEnd (idempotent), and clears the ref so the next turn starts fresh.
   *
   * Barge-in path: JarvisListener calls this from VAD.onSpeechStart when
   * micState === 'speaking'.
   */
  const stop = useCallback((): void => {
    controllerRef.current?.stop();
    controllerRef.current = null;
  }, []);

  return { playSentence, endOfTurn, stop };
}
