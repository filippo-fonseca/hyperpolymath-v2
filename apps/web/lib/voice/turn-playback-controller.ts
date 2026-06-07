"use client";

import { AudioQueue } from "./audio-queue";
import { DEFAULT_VOICE_ID } from "./constants";
import { collectStage } from "./voice-stage-collector";
import type { VoiceSettings } from "./types";

/**
 * Phase 10 Plan 10-04 (LAT-02 + LAT-03) — per-turn playback orchestrator.
 *
 * Public surface:
 *   - playSentence(text, seq) — dispatch one sentence at sequence index `seq`.
 *     Multiple in-flight calls are allowed (D-01 pipelined dispatch). Audio
 *     plays in seq-order (D-01 strict-order guarantee at AudioQueue.enqueue,
 *     NOT at fetch boundary).
 *   - endOfTurn() — signal that no more sentences will be dispatched. onEnd
 *     fires once all in-flight fetches drain AND AudioQueue empties.
 *   - stop() — abort every in-flight fetch + AudioQueue.stopAll() +
 *     SpeechSynthesis.cancel() + fire onEnd (idempotent). D-04 stop-all.
 *
 * D-01: pipelined fetches; in-order playback via enqueueGate Map.
 * D-04: stop() = abort all + flush + onEnd (idempotent).
 * D-04: fallback policy — seq 0 fail → SpeechSynthesis whole turn;
 *       seq ≥ 1 fail → silent drop + console.warn.
 * D-06: tts_first_byte_at fires ONCE per turn (firstByteCaptured guard).
 * Phase 9 TEL-01: audio_first_play_at inherited from AudioQueue.firstPlayCaptured
 *       (this controller creates one AudioQueue per turn, so first-of-queue
 *       == first-of-turn semantics are correct).
 *
 * CLAUDE.md no-global-stores: this is a CLASS instantiated by useTtsPlayer
 * inside a useRef. NOT exported as a singleton. NOT in a React Context.
 * NOT a module-level variable. Per-turn lifecycle: created on first
 * playSentence, destroyed on endOfTurn() (after onEnd fires) or stop().
 *
 * Per-sentence AbortController timeout: 8s (planner discretion). Loud
 * user-visible failure is preferable to silent late drops on a long turn.
 */

export interface TurnPlaybackParams {
  voiceId: string;
  ttsProvider: VoiceSettings["ttsProvider"];
  audioContext: AudioContext;
  /** Fired on the FIRST audio-out start of the turn. */
  onStart: () => void;
  /**
   * Fired when ALL queued audio has drained AND no in-flight fetches remain
   * AND endOfTurn() has been called (or stop() forced termination).
   * Idempotent — the controller guards against double-fire.
   */
  onEnd: () => void;
  /**
   * When true, route ALL sentences through SpeechSynthesis from the start.
   * Used by the hook when the user's `ttsProvider === 'browser'` — there is
   * no ElevenLabs attempt at all in that mode.
   */
  forceFallback?: boolean;
}

const PER_SENTENCE_TIMEOUT_MS = 8000;

export class TurnPlaybackController {
  private audioQueue: AudioQueue;
  // D-01: pipelined fetches; in-order playback via enqueueGate Map.
  private inFlight: Map<number, AbortController> = new Map();
  private enqueueGate: Map<number, Promise<void>> = new Map();
  // D-04: fallback policy state. Flips to 'browser' on seq 0 ElevenLabs
  // failure (and never flips back within this turn).
  private fallbackVoice: "elevenlabs" | "browser" = "elevenlabs";
  // D-06: one-shot guard for tts_first_byte_at. fires on FIRST sentence's
  // /api/jarvis/tts response (semantic shifts from "first byte of whole
  // utterance" to "first byte of first sentence" per Phase 9 reinterpretation).
  private firstByteCaptured = false;
  private endOfTurnCalled = false;
  private stopped = false;
  private endFired = false;
  private firstAudioStarted = false;
  private params: TurnPlaybackParams;

  constructor(params: TurnPlaybackParams) {
    this.params = params;
    this.audioQueue = new AudioQueue(params.audioContext);
    // Drive maybeFireOnEnd off the AudioQueue draining — once all enqueued
    // sources finish playing AND endOfTurn() was called AND no fetches are
    // in flight, fire onEnd.
    this.audioQueue.onAllEnded(() => this.maybeFireOnEnd());
    if (params.forceFallback) {
      this.fallbackVoice = "browser";
    }
  }

  /**
   * Dispatch a sentence for playback at the given sequence index.
   * Sequence index MUST be monotonic per turn starting at 0.
   * Returns when this sentence's fetch + enqueue chain is complete (or has
   * fallen back / silently dropped). Audio is played asynchronously.
   */
  async playSentence(text: string, seq: number): Promise<void> {
    if (this.stopped) return;

    // Browser-direct path — never touch ElevenLabs.
    if (this.fallbackVoice === "browser") {
      this.speakViaSpeechSynthesis(text);
      return;
    }

    // Install the in-order enqueue gate for this seq BEFORE issuing the fetch.
    // Out-of-order fetch resolution can't bypass this gate, so audio always
    // plays in seq order (D-01).
    const prevGate =
      seq === 0
        ? Promise.resolve()
        : (this.enqueueGate.get(seq - 1) ?? Promise.resolve());
    let resolveThisGate!: () => void;
    this.enqueueGate.set(
      seq,
      new Promise<void>((r) => {
        resolveThisGate = r;
      }),
    );

    const ctrl = new AbortController();
    this.inFlight.set(seq, ctrl);
    // D-04 / planner discretion: per-sentence 8s timeout. Total budget grows
    // with N, but a single-sentence stall is the failure we want to be loud about.
    const timeout = setTimeout(
      () => ctrl.abort(),
      PER_SENTENCE_TIMEOUT_MS,
    );

    try {
      const res = await fetch("/api/jarvis/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voiceId: this.params.voiceId || DEFAULT_VOICE_ID,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      // D-06: TTFB capture. Fire ONCE per turn on the FIRST sentence's
      // response. Subsequent fetches do not re-fire. Same call site as the
      // Phase 9 / TEL-01 contract — semantic shift only.
      if (!this.firstByteCaptured) {
        this.firstByteCaptured = true;
        collectStage("tts_first_byte_at", new Date());
      }

      // 502 is the upstream-failed sentinel (Pitfall 7 / CRITICAL_PHASE7_CONCERNS #6).
      if (res.status === 502 || !res.ok || !res.body) {
        throw new Error(`TTS upstream ${res.status}`);
      }

      // LAT-03: stream the body chunk-by-chunk into AudioQueue. NO full-body
      // await res.arrayBuffer(). PCM is frame-aligned (2 bytes/sample) and
      // AudioQueue handles odd-byte runts internally (Plan 10-03).
      const reader = res.body.getReader();
      // Wait for our predecessor's enqueue gate before enqueueing any of our
      // chunks. D-01 strict-order guarantee.
      await prevGate;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        if (this.stopped) break;
        // value is a Uint8Array view into the network chunk; slice into a
        // standalone ArrayBuffer for AudioQueue.enqueue().
        const buf = value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ) as ArrayBuffer;
        await this.audioQueue.enqueue(buf);
        if (!this.firstAudioStarted) {
          this.firstAudioStarted = true;
          this.params.onStart();
        }
      }
    } catch (err) {
      clearTimeout(timeout);
      const e = err as { name?: string; message?: string };
      if (e?.name === "AbortError") {
        // stop() was called OR the per-sentence 8s timeout fired. If stop()
        // owned this, the FSM is already cycling — exit silently.
        if (this.stopped) {
          resolveThisGate();
          this.inFlight.delete(seq);
          return;
        }
        // Timeout abort: fall through to the fallback-policy branch below.
      }
      // D-04 fallback policy.
      if (seq === 0 && !this.firstAudioStarted) {
        // First sentence failed BEFORE any audio played → switch the whole
        // turn to SpeechSynthesis. Replay this sentence via the browser.
        console.warn(
          "[tts] sentence 0 failed; falling back to SpeechSynthesis for turn",
          err,
        );
        this.fallbackVoice = "browser";
        this.speakViaSpeechSynthesis(text);
      } else {
        // Sentence ≥ 1, OR sentence 0 after audio already started: silent
        // drop. Subsequent sentences continue via ElevenLabs. Mixing
        // ElevenLabs + SpeechSynthesis mid-turn is jarring (two different
        // voices in one response) — D-04 explicitly forbids it.
        console.warn(`[tts] sentence ${seq} failed silently`, err);
      }
    } finally {
      resolveThisGate();
      this.inFlight.delete(seq);
      // If endOfTurn was already called and this was the last in-flight,
      // check whether we can fire onEnd now.
      this.maybeFireOnEnd();
    }
  }

  /**
   * Signal that no more sentences will be dispatched. The controller fires
   * onEnd once all in-flight fetches drain AND AudioQueue empties.
   */
  endOfTurn(): void {
    this.endOfTurnCalled = true;
    this.maybeFireOnEnd();
  }

  /**
   * Stop everything immediately: abort every in-flight fetch, flush
   * AudioQueue, cancel any SpeechSynthesis. Fires onEnd (idempotent).
   * D-04 stop-all.
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const ctrl of this.inFlight.values()) {
      try {
        ctrl.abort();
      } catch {
        // Non-fatal — controller may already be aborted.
      }
    }
    this.inFlight.clear();
    this.audioQueue.stopAll();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (!this.endFired) {
      this.endFired = true;
      this.endOfTurnCalled = true;
      this.params.onEnd();
    }
  }

  /**
   * Internal: fire onEnd iff endOfTurn was called AND no fetches are in flight.
   * Idempotent via the endFired guard. Called from:
   *   - playSentence finally block (in-flight count just dropped)
   *   - AudioQueue.onAllEnded callback (last source node finished)
   *   - endOfTurn() (the no-pending-work-at-all fast path)
   */
  private maybeFireOnEnd(): void {
    if (this.endFired) return;
    if (this.stopped) return;
    if (!this.endOfTurnCalled) return;
    if (this.inFlight.size > 0) return;
    this.endFired = true;
    this.params.onEnd();
  }

  /**
   * SpeechSynthesis fallback path (D-04). Used both for forceFallback=true
   * (user's ttsProvider === 'browser') and for the post-seq-0-fail whole-
   * turn fallback.
   */
  private speakViaSpeechSynthesis(text: string): void {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      this.maybeFireOnEnd();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    // Best-effort British voice — first matching en-GB voice.
    const voices = window.speechSynthesis.getVoices();
    const gb = voices.find((v) => v.lang === "en-GB");
    if (gb) u.voice = gb;
    u.onstart = () => {
      if (!this.firstAudioStarted) {
        this.firstAudioStarted = true;
        this.params.onStart();
      }
    };
    u.onend = () => {
      // No fetches were tracked for this sentence — it never entered the
      // inFlight map. maybeFireOnEnd is the right place to settle.
      this.maybeFireOnEnd();
    };
    window.speechSynthesis.speak(u);
  }
}
