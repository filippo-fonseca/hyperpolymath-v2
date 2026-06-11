// Mobile TTS playback — port of apps/desktop/src/audio/tts-player.ts.
// Single-flight ordered queue: sentences arrive out of order (sentence 2 may
// finish fetching before sentence 1); we buffer by seq and drain in order.
// Each sentence: fetch raw PCM → wrap in WAV → write temp file → play with
// expo-audio's createAudioPlayer.

import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";

import { fetchTtsPcm } from "../lib/api";
import { pcmToWav } from "../lib/pcm";
import { DEFAULT_VOICE_ID } from "../lib/settings";

const TTS_SAMPLE_RATE = 24000;

interface QueuedSentence {
  text: string;
  seq: number;
}

export type TtsQueueState = "idle" | "playing";

export class TtsQueue {
  private voiceId = DEFAULT_VOICE_ID;
  private enabled = true;
  private state: TtsQueueState = "idle";
  private queue: QueuedSentence[] = [];
  private nextSeq = 0;
  private generation = 0;
  private currentPlayer: AudioPlayer | null = null;
  private fileCounter = 0;
  private stateListeners = new Set<(state: TtsQueueState) => void>();

  onStateChange(fn: (state: TtsQueueState) => void): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  private setState(next: TtsQueueState): void {
    if (next === this.state) return;
    this.state = next;
    for (const fn of this.stateListeners) fn(next);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  setVoiceId(voiceId: string): void {
    this.voiceId = voiceId;
  }

  /** Enqueue a sentence; played in seq order, gaps wait for the missing seq. */
  enqueueSentence(text: string, seq: number): void {
    if (!this.enabled || !text.trim()) return;
    this.queue.push({ text, seq });
    this.queue.sort((a, b) => a.seq - b.seq);
    this.drain();
  }

  /** Stop playback immediately and clear the queue. */
  stop(): void {
    this.generation++;
    if (this.currentPlayer) {
      try {
        this.currentPlayer.pause();
        this.currentPlayer.remove();
      } catch {
        // already released
      }
      this.currentPlayer = null;
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

  private playNextIfReady(): void {
    const head = this.queue[0];
    if (!head || head.seq !== this.nextSeq) {
      if (this.queue.length === 0) this.setState("idle");
      return;
    }
    this.queue.shift();
    this.nextSeq++;
    this.setState("playing");
    const gen = this.generation;
    void this.playSentence(head.text, gen).finally(() => {
      if (gen !== this.generation) return; // stopped mid-flight
      this.currentPlayer = null;
      this.playNextIfReady();
    });
  }

  private async playSentence(text: string, gen: number): Promise<void> {
    try {
      const pcm = await fetchTtsPcm({ text, voiceId: this.voiceId });
      if (!pcm || gen !== this.generation) return;

      const wav = pcmToWav(pcm, TTS_SAMPLE_RATE, 1);
      const file = new File(Paths.cache, `jarvis-tts-${this.fileCounter++ % 8}.wav`);
      file.write(wav);

      if (gen !== this.generation) return;

      await new Promise<void>((resolve) => {
        const player = createAudioPlayer({ uri: file.uri });
        this.currentPlayer = player;
        const sub = player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish) {
            sub.remove();
            try {
              player.remove();
            } catch {
              // already released by stop()
            }
            resolve();
          }
        });
        player.play();
      });
    } catch (err) {
      console.warn("[tts] playSentence failed", err);
    }
  }
}
