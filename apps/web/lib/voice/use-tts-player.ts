"use client";

import { useRef, useCallback } from "react";
import { AudioQueue } from "./audio-queue";
import { DEFAULT_VOICE_ID } from "./constants";
import type { VoiceSettings } from "./types";
// Phase 9 / TEL-01 — TTFB capture for tts_first_byte_at. Fires once per
// /api/jarvis/tts response, AFTER fetch resolves (headers + first chunk
// landed) and BEFORE the upstream status check. No-op when activeTurnId
// is unbound (text-only turns).
import { collectStage } from "@/lib/voice/voice-stage-collector";

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

        // Phase 9 / TEL-01 — TTFB capture. First response chunk has arrived;
        // body is now readable. Even if status is non-2xx and we fall back,
        // we still record this as the moment the proxy responded. TTFB
        // (not TTLB — `await res.arrayBuffer()` below waits for the WHOLE
        // body, which would be wrong for this stage's semantics).
        collectStage("tts_first_byte_at", new Date());

        // 502 is the upstream-failed sentinel (Pitfall 7 / CRITICAL_PHASE7_CONCERNS #6).
        // Any 5xx or non-OK response triggers SpeechSynthesis fallback.
        if (res.status === 502 || !res.ok || !res.body) {
          console.warn(
            "[tts] ElevenLabs failed, falling back to SpeechSynthesis",
            res.status,
          );
          return play({ ...params, ttsProvider: "browser" });
        }

        // Buffer the entire MP3 body before decoding. Streaming MP3 chunk-by-
        // chunk to decodeAudioData is broken: ElevenLabs returns HTTP chunks
        // of arbitrary size, but MP3 needs frame-aligned segments to decode
        // correctly. Decoding partial frames produces choppy / cut-off audio
        // (verified in Safari, Phase 7 verification).
        //
        // Trade-off: ~500ms extra latency to wait for the full body. With
        // ElevenLabs Flash v2.5 (~300ms TTFB) the total stays inside the
        // ~2s budget that feels conversational. For longer prose responses
        // we may want MSE-based streaming later, but Flash is short by design.
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
        queue.onAllEnded(safeOnEnd);

        try {
          const full = await res.arrayBuffer();
          if (full.byteLength === 0) {
            safeOnEnd();
            return;
          }
          await queue.enqueue(full);
          onStart();
        } catch (err) {
          console.warn("[tts] decode failed, falling back to SpeechSynthesis", err);
          return play({ ...params, ttsProvider: "browser" });
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
