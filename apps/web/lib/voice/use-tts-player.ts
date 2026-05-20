"use client";

import { useRef, useCallback } from "react";
import { AudioQueue } from "./audio-queue";
import { DEFAULT_VOICE_ID } from "./constants";
import type { VoiceSettings } from "./types";

interface PlayParams {
  text: string;
  voiceId: string;
  ttsProvider: VoiceSettings["ttsProvider"];
  audioContext: AudioContext;
  onStart: () => void;
  onEnd: () => void;
}

/**
 * Phase 7 Plan 07-04 — TTS playback hook.
 *
 * Fallback chain (per CONTEXT.md Claude's Discretion line 66):
 *   1. ElevenLabs Flash WS via /api/jarvis/tts (default)
 *   2. browser SpeechSynthesis on /api/jarvis/tts 502 or network error
 *   3. Silence when ttsProvider === 'off'
 *
 * CRITICAL_PHASE7_CONCERNS #6 — ElevenLabs failure / fallback policy:
 *   - 8s overall fetch timeout via AbortController (covers WS handshake)
 *   - On abort or 5xx: fall through to SpeechSynthesis (no retry — voice
 *     should be responsive, not reliable-but-late)
 *   - TTS proxy returns 502 when ElevenLabs is unreachable (Pitfall 7) —
 *     this is the sentinel that triggers client-side fallback
 *   - stop() always aborts the in-flight fetch + stopAll() the queue,
 *     guaranteeing FSM exits 'speaking' within ~50ms of the call
 *
 * Barge-in (VOICE-12): the caller (JarvisListener) calls stop() from
 * VAD.onSpeechStart when micState==='speaking'. stop() is synchronous
 * from the AudioQueue side; the AbortController cancels the fetch.
 */
export function useTtsPlayer() {
  const queueRef = useRef<AudioQueue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Track whether onEnd was already called (prevents double-fire).
  const endCalledRef = useRef(false);

  const play = useCallback(
    async (params: PlayParams): Promise<void> => {
      const { text, voiceId, ttsProvider, audioContext, onStart, onEnd } =
        params;

      // Silence branch
      if (ttsProvider === "off" || !text.trim()) {
        onEnd();
        return;
      }

      // Browser SpeechSynthesis branch (intentional fallback or user-selected provider).
      if (ttsProvider === "browser") {
        const u = new SpeechSynthesisUtterance(text);
        // Best-effort British voice — first matching en-GB voice.
        const voices = window.speechSynthesis.getVoices();
        const gb = voices.find((v) => v.lang === "en-GB");
        if (gb) u.voice = gb;
        u.onstart = onStart;
        u.onend = onEnd;
        speechSynthRef.current = u;
        window.speechSynthesis.speak(u);
        return;
      }

      // ElevenLabs path (default)
      endCalledRef.current = false;
      const abort = new AbortController();
      abortRef.current = abort;
      const timeout = setTimeout(() => abort.abort(), 8000);

      try {
        const res = await fetch("/api/jarvis/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voiceId: voiceId || DEFAULT_VOICE_ID,
          }),
          signal: abort.signal,
        });
        clearTimeout(timeout);

        // 502 is the upstream-failed sentinel (Pitfall 7 / CRITICAL_PHASE7_CONCERNS #6).
        // Any 5xx or non-OK response triggers SpeechSynthesis fallback.
        if (res.status === 502 || !res.ok || !res.body) {
          console.warn(
            "[tts] ElevenLabs failed, falling back to SpeechSynthesis",
            res.status,
          );
          return play({ ...params, ttsProvider: "browser" });
        }

        // Set up queue for chunked decoding.
        if (!queueRef.current) {
          queueRef.current = new AudioQueue(audioContext);
        }
        const queue = queueRef.current;

        const safeOnEnd = () => {
          if (!endCalledRef.current) {
            endCalledRef.current = true;
            onEnd();
          }
        };
        const offEnded = queue.onAllEnded(safeOnEnd);

        let first = true;
        const reader = res.body.getReader();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;

          // Clone the ArrayBuffer so decodeAudioData gets an owned copy.
          const buf = value.buffer.slice(
            value.byteOffset,
            value.byteOffset + value.byteLength,
          );

          try {
            await queue.enqueue(buf as ArrayBuffer);
            if (first) {
              onStart();
              first = false;
            }
          } catch (err) {
            // Don't bail — mp3 chunked decoder may need >1 chunk to make a frame.
            console.warn("[tts] chunk decode failed", err);
          }
        }

        // If no audio decoded (e.g. empty stream), call onEnd defensively.
        if (first) {
          offEnded();
          safeOnEnd();
        }
      } catch (err) {
        clearTimeout(timeout);
        const e = err as { name?: string };
        // AbortError = stop() was called (barge-in or explicit stop) — call onEnd.
        if (e?.name === "AbortError") {
          if (!endCalledRef.current) {
            endCalledRef.current = true;
            onEnd();
          }
          return;
        }
        // Network/other error → SpeechSynthesis fallback.
        console.warn("[tts] fetch failed, falling back to SpeechSynthesis", err);
        return play({ ...params, ttsProvider: "browser" });
      }
    },
    [],
  );

  /**
   * Stop all audio immediately.
   * Barge-in path: JarvisListener calls this from VAD.onSpeechStart when
   * micState==='speaking', then dispatches SPEECH_START to the FSM.
   */
  const stop = useCallback(() => {
    // Cancel in-flight ElevenLabs fetch.
    abortRef.current?.abort();
    abortRef.current = null;

    // Stop AudioBufferSourceNode chain.
    if (queueRef.current) {
      queueRef.current.stopAll();
      // Reset queue so the next play() creates a fresh one.
      queueRef.current = null;
    }

    // Stop SpeechSynthesis utterance (browser fallback).
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speechSynthRef.current = null;
  }, []);

  return { play, stop };
}
