"use client";

import { collectStage } from "@/lib/voice/voice-stage-collector";

/**
 * Phase 7 Plan 07-04 — AudioBufferSourceNode chain for streaming TTS chunks.
 * Phase 10 Plan 10-03 (LAT-01) — rewritten enqueue() to build AudioBuffers
 * directly from raw PCM bytes.
 *
 * Pattern (LAT-01 / Phase 10): ElevenLabs returns chunked raw 16-bit signed
 * LE PCM @ 24kHz mono. We build AudioBuffers directly from Int16Array →
 * Float32Array and schedule successive AudioBufferSourceNodes so playback
 * is gapless. PCM is frame-aligned trivially (2 bytes/sample) so chunks of
 * arbitrary size flow; odd-byte runts (incomplete sample at boundary) are
 * retained and prepended to the next chunk. NOT MediaSource Extensions
 * (RESEARCH explicitly rules out MSE for raw streaming audio — pattern is
 * for video).
 *
 * Phase 7/9 invariants preserved: analyserNode tap, firstPlayCaptured
 * one-shot (TEL-01), gapless scheduledEnd chaining, onAllEnded callback,
 * stopAll behavior.
 *
 * Barge-in: stopAll() cancels all nodes immediately and resets the schedule
 * pointer (and the per-turn leftoverByte spill). Called from JarvisListener
 * when VAD detects onSpeechStart during state='speaking'.
 */
export class AudioQueue {
  private ctx: AudioContext;
  private scheduledEnd = 0;
  private nodes: AudioBufferSourceNode[] = [];
  private analyserNode: AnalyserNode | null = null;
  private onEndedCallbacks: Set<() => void> = new Set();
  // Phase 9 / TEL-01 — one-shot guard for audio_first_play_at. use-tts-player
  // creates a fresh AudioQueue per turn, so "first node in this queue" ==
  // "first audio of this turn". Reset by stopAll() for defensive re-use.
  private firstPlayCaptured = false;
  // Phase 10 / LAT-01 — odd-byte runt spill across enqueue calls. PCM is
  // 2 bytes/sample; if a network chunk has odd byteLength, the trailing
  // byte is incomplete and must be held for the next chunk. Single-byte
  // spill is the only valid leftover.
  private leftoverByte: Uint8Array | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /**
   * Register a listener that fires when the last queued node finishes playing.
   * Returns an unsubscribe function.
   */
  onAllEnded(fn: () => void): () => void {
    this.onEndedCallbacks.add(fn);
    return () => this.onEndedCallbacks.delete(fn);
  }

  /**
   * Enqueue a raw PCM chunk (16-bit signed LE @ 24kHz mono) and schedule
   * it to play after the last chunk. Builds an AudioBuffer directly from
   * Int16Array → Float32Array. Returns the source node so callers can
   * attach analyser taps etc.
   *
   * Note: declared async for backward-compat with the prior MP3 signature;
   * the body is fully synchronous now.
   */
  async enqueue(chunk: ArrayBuffer): Promise<AudioBufferSourceNode> {
    // 1. Merge leftover from prior chunk (if any) + this chunk's bytes.
    let bytes = new Uint8Array(chunk);
    if (this.leftoverByte) {
      const merged = new Uint8Array(this.leftoverByte.length + bytes.length);
      merged.set(this.leftoverByte, 0);
      merged.set(bytes, this.leftoverByte.length);
      bytes = merged;
      this.leftoverByte = null;
    }

    // 2. If odd length, retain trailing byte for next chunk. Single-byte
    //    spill is the only valid leftover; anything else is upstream framing
    //    breakage and we don't try to recover.
    if (bytes.length % 2 === 1) {
      this.leftoverByte = bytes.slice(bytes.length - 1);
      bytes = bytes.slice(0, bytes.length - 1);
    }

    // 3. Int16 (LE) → Float32 in [-1.0, 1.0).
    //    int16 / 32768.0 ≡ int16 / 0x8000 — using the literal 32768.0 form
    //    for readability per the planner's discretion.
    const sampleCount = bytes.length / 2;
    const int16 = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      sampleCount,
    );
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    // 4. Build the AudioBuffer at the PCM sample rate. createBuffer is the
    //    universally-supported form (Safari 18.x lacks the
    //    `new AudioBuffer({...})` constructor).
    //    Args: (numberOfChannels=1 mono, length=sampleCount, sampleRate=24000).
    const buffer = this.ctx.createBuffer(1, sampleCount, 24000);
    buffer.copyToChannel(float32, 0);

    // 5. Source node + analyser tap + scheduling — identical to the prior
    //    MP3 path (analyserNode tap and gapless scheduledEnd preserved).
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;

    if (this.analyserNode) {
      node.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);
    } else {
      node.connect(this.ctx.destination);
    }

    const startAt = Math.max(this.ctx.currentTime, this.scheduledEnd);
    node.start(startAt);
    // Phase 9 / TEL-01 — first audio-out moment per AudioQueue lifecycle.
    // use-tts-player creates a fresh AudioQueue per turn, so "first node in
    // this queue instance" == "first audio of this turn". One-shot via the
    // firstPlayCaptured flag so subsequent chunks don't re-fire the stage.
    if (!this.firstPlayCaptured) {
      this.firstPlayCaptured = true;
      collectStage("audio_first_play_at", new Date());
    }
    this.scheduledEnd = startAt + buffer.duration;
    this.nodes.push(node);

    node.onended = () => {
      this.nodes = this.nodes.filter((n) => n !== node);
      if (this.nodes.length === 0) {
        this.onEndedCallbacks.forEach((fn) => fn());
      }
    };

    return node;
  }

  /**
   * Stop all currently playing/scheduled nodes immediately.
   * Resets the schedule pointer so the next enqueue starts from now.
   * Called for barge-in (VOICE-12) and on component unmount.
   */
  stopAll() {
    // Phase 9 / TEL-01 — reset the first-play guard so a re-used AudioQueue
    // (defensive — shouldn't happen with current use-tts-player but covers
    // future paths) captures audio_first_play_at on the next enqueue chain.
    this.firstPlayCaptured = false;
    // Phase 10 / LAT-01 — clear the per-turn odd-byte runt spill so a new
    // turn never inherits a stale leftover from an aborted turn.
    this.leftoverByte = null;
    const toStop = [...this.nodes];
    this.nodes = [];
    this.scheduledEnd = 0;
    for (const node of toStop) {
      try {
        node.stop();
      } catch {
        // Already stopped — non-fatal.
      }
    }
    this.onEndedCallbacks.forEach((fn) => fn());
    this.onEndedCallbacks.clear();
  }

  /**
   * Attach an AnalyserNode between source nodes and the destination.
   * Used by MicIndicatorDot for amplitude-driven pulse animation.
   * Must be called before enqueue() for the analyser to receive audio.
   */
  setAnalyser(analyser: AnalyserNode) {
    this.analyserNode = analyser;
  }

  /**
   * Create and attach a new AnalyserNode for amplitude-driven UI.
   * Returns the analyser so the caller can read frequency data.
   */
  createAnalyser(): AnalyserNode {
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    this.analyserNode = analyser;
    return analyser;
  }
}
