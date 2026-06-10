// apps/desktop/src/audio/tts-player.ts
// Desktop TTS playback: fetches raw PCM audio from /api/jarvis/tts via
// Tauri plugin-http (bypasses WKWebView CORS) and plays it through
// AudioContext. Sentence-level streaming: sentences are enqueued as they
// arrive from the SSE stream; each plays in sequence (ordered by seq number).
//
// Output format: raw 16-bit signed LE PCM @ 24kHz mono — same as the server
// emits (output_format=pcm_24000). We decode with AudioContext.decodeAudioData
// after wrapping in a minimal WAV header, or decode manually via DataView.

import { fetch } from "@tauri-apps/plugin-http";
import { getEnv } from "@/env";
import { getDeviceToken } from "@/auth/device-token";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George (warm British male)

interface QueuedSentence {
  text: string;
  seq: number;
}

type TtsPlayerState = "idle" | "playing";

/**
 * Single-flight ordered TTS queue.
 *
 * Sentences arrive out-of-order (sentence 2 might finish fetching before
 * sentence 1). We buffer by seq and drain in order. Only one AudioContext
 * source plays at a time.
 */
export class TtsPlayer {
  private voiceId: string;
  private enabled: boolean;
  private state: TtsPlayerState = "idle";
  private queue: QueuedSentence[] = [];
  private nextSeq = 0;
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private abortController: AbortController | null = null;
  private stateListeners = new Set<(state: TtsPlayerState) => void>();

  constructor(voiceId = DEFAULT_VOICE_ID, enabled = true) {
    this.voiceId = voiceId;
    this.enabled = enabled;
  }

  /** Subscribe to state transitions (idle ↔ playing). */
  onStateChange(fn: (state: TtsPlayerState) => void): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  private setState(next: TtsPlayerState): void {
    if (next === this.state) return;
    this.state = next;
    for (const fn of this.stateListeners) fn(next);
  }

  /** Update whether TTS is active. When disabled, all enqueues become no-ops. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  /** Update the ElevenLabs voice ID used for subsequent sentences. */
  setVoiceId(voiceId: string): void {
    this.voiceId = voiceId;
  }

  /**
   * Enqueue a sentence for playback. Sentences are played in seq order;
   * gaps in seq (i.e. a later sentence arriving first) wait until the gap
   * is filled before playing.
   */
  enqueueSentence(text: string, seq: number): void {
    if (!this.enabled || !text.trim()) return;

    // Lazy AudioContext init — must happen after first user gesture in
    // WKWebView, but Tauri's webview policy is more permissive.
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: 24000 });
    }

    this.queue.push({ text, seq });
    this.queue.sort((a, b) => a.seq - b.seq);
    this.drain();
  }

  /** Stop all playback immediately and clear the queue. */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // ignore if already stopped
      }
      this.currentSource = null;
    }
    this.queue = [];
    this.nextSeq = 0;
    this.setState("idle");
  }

  /** Reset between turns — clears the seq counter for the next turn. */
  resetTurn(): void {
    this.nextSeq = 0;
  }

  private drain(): void {
    if (this.state === "playing") return;
    this.playNextIfReady();
  }

  /** Always-callable: starts the next sentence if one is ready, otherwise
   *  transitions to idle. Called from drain() AND from the .finally() of
   *  the previous playSentence (the previous version's `drain()` returned
   *  early there because `state` was still "playing" — sentences 2+ were
   *  silently dropped). */
  private playNextIfReady(): void {
    const head = this.queue[0];
    if (!head || head.seq !== this.nextSeq) {
      if (this.queue.length === 0) this.setState("idle");
      return;
    }
    this.queue.shift();
    this.nextSeq++;
    this.setState("playing");
    void this.playSentence(head.text).finally(() => {
      this.currentSource = null;
      this.playNextIfReady();
    });
  }

  private async playSentence(text: string): Promise<void> {
    const { apiBaseUrl, triggerSecret } = getEnv();
    const ac = new AbortController();
    this.abortController = ac;

    // Device bearer token is the canonical auth — the trigger secret is
    // empty in production DMG builds (CI only injects VITE_API_BASE_URL),
    // which made every TTS request 401 and the app silently never spoke.
    const token = await getDeviceToken();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-trigger-secret": triggerSecret,
    };
    if (token) headers["authorization"] = `Bearer ${token}`;

    try {
      const res = await fetch(`${apiBaseUrl}/api/jarvis/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceId: this.voiceId }),
        signal: ac.signal as AbortSignal,
      });

      if (!res.ok) {
        console.warn(`[tts] server returned ${res.status} — skipping sentence`);
        return;
      }

      // Response body: raw 16-bit signed LE PCM @ 24kHz mono.
      // Wrap in a WAV container so AudioContext.decodeAudioData can handle it.
      const pcmBytes = new Uint8Array(await res.arrayBuffer());
      if (!pcmBytes.byteLength) return;

      const wavBuffer = pcmToWav(pcmBytes, 24000, 1);

      if (!this.audioCtx) return; // stopped during fetch

      const audioBuffer = await this.audioCtx.decodeAudioData(wavBuffer);

      if (!this.audioCtx) return; // stopped during decode

      await new Promise<void>((resolve) => {
        const source = this.audioCtx!.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioCtx!.destination);
        this.currentSource = source;
        source.onended = () => resolve();
        source.start();
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "AbortError") return; // cancelled by stop()
      console.error("[tts] playSentence failed", err);
    } finally {
      this.abortController = null;
    }
  }
}

/**
 * Wrap raw PCM bytes in a minimal RIFF WAV container so AudioContext can
 * decode them with decodeAudioData.
 *
 * Format: 16-bit signed LE PCM, mono, 24kHz.
 * Spec: http://soundfile.sapp.org/doc/WaveFormat/
 */
function pcmToWav(pcm: Uint8Array, sampleRate: number, channels: number): ArrayBuffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");

  // fmt sub-chunk
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // PCM payload
  new Uint8Array(buffer, 44).set(pcm);
  return buffer;
}

function writeStr(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
