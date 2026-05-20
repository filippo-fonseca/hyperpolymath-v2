"use client";

/**
 * Phase 7 Plan 07-04 — AudioBufferSourceNode chain for streaming TTS chunks.
 *
 * Pattern: ElevenLabs returns chunked mp3 over HTTP. We decode each chunk with
 * decodeAudioData and schedule successive AudioBufferSourceNodes so playback
 * is gapless. NOT MediaSource Extensions (RESEARCH explicitly rules out MSE
 * for raw streaming audio — pattern is for video).
 *
 * Barge-in: stopAll() cancels all nodes immediately and resets the schedule
 * pointer. Called from JarvisListener when VAD detects onSpeechStart during
 * state='speaking'.
 */
export class AudioQueue {
  private ctx: AudioContext;
  private scheduledEnd = 0;
  private nodes: AudioBufferSourceNode[] = [];
  private analyserNode: AnalyserNode | null = null;
  private onEndedCallbacks: Set<() => void> = new Set();

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
   * Decode an mp3/audio chunk and schedule it to play after the last chunk.
   * Returns the AudioBufferSourceNode so callers can attach analyser taps etc.
   */
  async enqueue(chunk: ArrayBuffer): Promise<AudioBufferSourceNode> {
    const buffer = await this.ctx.decodeAudioData(chunk);
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
