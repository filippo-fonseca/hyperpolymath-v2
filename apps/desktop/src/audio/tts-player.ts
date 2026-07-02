// apps/desktop/src/audio/tts-player.ts
// Desktop TTS playback. Fetches raw PCM audio from /api/jarvis/tts via Tauri
// plugin-http (bypasses WKWebView CORS), then plays it NATIVELY in Rust via
// rodio (`invoke("tts_play_pcm", { bytes })`) — NOT through the WKWebView.
//
// Why native playback: a global hotkey / tray invocation gives no in-webview
// user gesture, so WebKit keeps the AudioContext suspended: nothing plays AND
// `AudioBufferSourceNode.onended` never fires, so the old per-sentence promise
// never resolved → the queue was stuck "playing" → the FSM was stuck
// "speaking" and the app froze. Rust rodio owns a real CoreAudio output stream
// and reports true playback state back via Tauri events.
//
// State (idle/playing) is driven SOLELY by the Rust `tts-playing` / `tts-idle`
// events (single source of truth), never by a webview `onended`. There is no
// code path that leaves the player "playing" forever: a fetch failure advances
// the queue, and a `tts-idle` event always transitions to idle.
//
// Output format: raw 16-bit signed LE PCM @ 24 kHz mono (output_format=pcm_24000),
// appended to the Rust sink in seq order so sentences play FIFO.

import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
 * sentence 1). We buffer by seq and drain in order, fetching each sentence's
 * PCM and appending it to the Rust rodio sink IN SEQ ORDER. The Rust sink plays
 * appended buffers FIFO, so ordering is preserved.
 *
 * The player's "playing"/"idle" state mirrors the Rust sink via the
 * `tts-playing` / `tts-idle` events. `whenIdle()` resolves when the sink has
 * fully drained AND we have no more sentences to fetch — that is the sequencing
 * primitive the FSM uses to reopen the mic only after speech finishes.
 */
export class TtsPlayer {
  private voiceId: string;
  private enabled: boolean;
  /** Local mirror of the Rust sink state, updated by tts-playing/tts-idle. */
  private sinkState: TtsPlayerState = "idle";
  /** Whether we're actively fetching/appending sentences for the current turn. */
  private draining = false;
  /** The public state we report to listeners (playing while draining OR sink busy). */
  private state: TtsPlayerState = "idle";
  private queue: QueuedSentence[] = [];
  private nextSeq = 0;
  private abortController: AbortController | null = null;
  private stateListeners = new Set<(state: TtsPlayerState) => void>();
  private idleWaiters = new Set<() => void>();
  private unlistenPlaying: UnlistenFn | null = null;
  private unlistenIdle: UnlistenFn | null = null;
  /** Coarse level for the HUD orb's "speaking" pulse (no webview analyser). */
  private eventsWired = false;

  constructor(voiceId = DEFAULT_VOICE_ID, enabled = true) {
    this.voiceId = voiceId;
    this.enabled = enabled;
    void this.wireRustEvents();
  }

  /**
   * Subscribe to the Rust sink's real playback state. This is the SINGLE source
   * of truth for whether audio is coming out of the speakers. Best-effort:
   * outside Tauri (plain vite dev) the listeners simply never fire, and the
   * fetch-side draining still drives state so nothing wedges.
   */
  private async wireRustEvents(): Promise<void> {
    if (this.eventsWired) return;
    this.eventsWired = true;
    try {
      this.unlistenPlaying = await listen("tts-playing", () => {
        this.sinkState = "playing";
        this.recomputeState();
      });
      this.unlistenIdle = await listen("tts-idle", () => {
        this.sinkState = "idle";
        this.recomputeState();
      });
    } catch {
      // Not running under Tauri — events unavailable. Draining still drives state.
      this.eventsWired = false;
    }
  }

  /** Subscribe to state transitions (idle ↔ playing). */
  onStateChange(fn: (state: TtsPlayerState) => void): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  /**
   * The player is "playing" if EITHER the Rust sink is non-empty OR we still
   * have sentences to fetch/append this turn. It is "idle" only when both the
   * sink has drained and we are done draining the queue. This guarantees the
   * FSM never leaves "speaking" prematurely, and (paired with the always-firing
   * tts-idle + the fetch-advances-on-failure logic) never gets stuck.
   */
  private recomputeState(): void {
    const next: TtsPlayerState =
      this.sinkState === "playing" || this.draining || this.queue.length > 0
        ? "playing"
        : "idle";
    if (next === this.state) return;
    this.state = next;
    for (const fn of this.stateListeners) fn(next);
    if (next === "idle") {
      const waiters = [...this.idleWaiters];
      this.idleWaiters.clear();
      for (const resolve of waiters) resolve();
    }
  }

  /** Current player state. */
  getState(): TtsPlayerState {
    return this.state;
  }

  /**
   * Coarse output amplitude (0..1) for the HUD orb's "speaking" pulse. Native
   * rodio playback gives us no per-sample tap in the webview, so we return a
   * gentle non-zero value while speaking and 0 otherwise. The orb's own
   * breathing/wobble makes this read as a living waveform.
   */
  getSpeakingLevel(): number {
    return this.state === "playing" ? 0.55 : 0;
  }

  /**
   * Resolves immediately if idle, otherwise on the next transition back to
   * idle (TTS fully drained). This is the sequencing primitive the FSM uses to
   * reopen the mic ONLY after speech finishes.
   */
  whenIdle(): Promise<void> {
    if (this.state === "idle") return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve);
    });
  }

  /**
   * No-op retained for API compatibility. Native rodio playback needs no
   * webview AudioContext unlock — there is nothing to prime.
   */
  unlock(): void {
    // Intentionally empty. Rust owns the output stream.
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
   * Enqueue a sentence for playback. Sentences are played in seq order; gaps in
   * seq (a later sentence arriving first) wait until the gap is filled before
   * being fetched + appended.
   */
  enqueueSentence(text: string, seq: number): void {
    if (!this.enabled || !text.trim()) return;

    this.queue.push({ text, seq });
    this.queue.sort((a, b) => a.seq - b.seq);
    this.recomputeState();
    this.drain();
  }

  /**
   * Speak a single canned line immediately (e.g. the FSM sign-off "Standing by,
   * sir."). Resets the seq counter so the line plays on its own.
   */
  speakNow(text: string): void {
    if (!this.enabled || !text.trim()) return;
    this.nextSeq = 0;
    this.enqueueSentence(text, 0);
  }

  /** Stop all playback immediately and clear the queue. */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.queue = [];
    this.nextSeq = 0;
    this.draining = false;
    // Tell Rust to stop + clear its sink. `tts_stop` emits `tts-idle`, but we
    // also optimistically set idle here so state is correct even outside Tauri.
    void invoke("tts_stop").catch(() => {
      // Not under Tauri (or command missing) — state still advances below.
    });
    this.sinkState = "idle";
    this.recomputeState();
  }

  /** Reset between turns — clears the seq counter for the next turn. */
  resetTurn(): void {
    this.nextSeq = 0;
  }

  /**
   * Drain the ordered queue: fetch each ready sentence's PCM and append it to
   * the Rust sink in seq order. Single-flight — only one drain loop runs at a
   * time. Robustness: a fetch failure logs and advances to the next sentence,
   * so a bad sentence can never wedge the queue.
   */
  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    this.recomputeState();
    void this.drainLoop().finally(() => {
      this.draining = false;
      // Sink may still be playing queued buffers; recompute reflects that. When
      // the sink later drains, `tts-idle` flips us to idle. Outside Tauri (no
      // events) the sink is treated idle, so this immediately goes idle.
      this.recomputeState();
    });
  }

  private async drainLoop(): Promise<void> {
    // Process sentences strictly in seq order. Stop when the head isn't the
    // next expected seq (a gap — wait for the missing sentence to arrive; the
    // enqueue that fills it will restart draining).
    for (;;) {
      const head = this.queue[0];
      if (!head || head.seq !== this.nextSeq) return;
      this.queue.shift();
      this.nextSeq++;
      // Fetch + append. On any failure we simply move on — never wedge.
      await this.playSentence(head.text);
    }
  }

  /** Fetch a sentence's PCM and append it to the Rust sink (FIFO order). */
  private async playSentence(text: string): Promise<void> {
    const { apiBaseUrl, triggerSecret } = getEnv();
    const ac = new AbortController();
    this.abortController = ac;

    // Device bearer token is the canonical auth — the trigger secret is empty
    // in production DMG builds, which made every TTS request 401.
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

      // Raw 16-bit signed LE PCM @ 24 kHz mono. Hand the bytes straight to Rust.
      const pcmBytes = new Uint8Array(await res.arrayBuffer());
      if (!pcmBytes.byteLength) return;

      // `bytes` must be a plain number[] so Tauri's IPC serialises it as a
      // Vec<u8>. Array.from on a typed array is exact and cheap enough here.
      await invoke("tts_play_pcm", { bytes: Array.from(pcmBytes) });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "AbortError") return; // cancelled by stop()
      console.error("[tts] playSentence failed", err);
    } finally {
      this.abortController = null;
    }
  }
}
