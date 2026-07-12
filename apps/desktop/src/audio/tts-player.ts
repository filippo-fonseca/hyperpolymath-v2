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
import {
  LocalSpeech,
  defaultLocalSpeechBackends,
  type LocalSpeechBackends,
} from "@/audio/local-speech";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George (warm British male)

/**
 * Voice health surfaced to the HUD. `ok` = ElevenLabs is speaking; `degraded` =
 * ElevenLabs failed and JARVIS is speaking through the local fallback voice.
 * `reason` mirrors the TTS route's 502 body when we can read it.
 */
export interface VoiceStatus {
  state: "ok" | "degraded";
  reason?: "key_missing" | "auth" | "transient";
}

interface QueuedSentence {
  text: string;
  seq: number;
}

interface TurnRecord {
  /** Sentences pending playback for this turn, sorted by seq. */
  sentences: QueuedSentence[];
  /** Next seq the drain expects from this turn (starts at 0, matches jarvis-response.ts). */
  nextSeq: number;
  /** True once the SSE stream signaled `response-end` for this turn — drain can retire the turn once empty. */
  ended: boolean;
}

type TtsPlayerState = "idle" | "playing";

/**
 * Turn-aware ordered TTS queue.
 *
 * Sentences arrive out-of-order within a turn (sentence 2 might finish fetching
 * before sentence 1), AND multiple turns can overlap (a routine's opener turn
 * fires concurrently with the brief-gather; per-block fillers are queued while
 * the opener is still playing; a normal turn can interleave with a routine).
 *
 * Design: one queue PER turnId, plus a FIFO `turnOrder` of turnIds by
 * first-seen. The drain always plays the head turn's next expected sentence,
 * then retires the turn once it has ended AND its queue is empty, then advances
 * to the next turn. Arrival order == play order across turns; per-turn seq
 * ordering is preserved. No global seq counter → no cross-turn wedge.
 *
 * The player's "playing"/"idle" state mirrors the Rust sink via the
 * `tts-playing` / `tts-idle` events, PLUS the presence of pending sentences.
 * `whenIdle()` resolves only when the sink has drained AND every turn is
 * retired — that is the sequencing primitive the FSM uses to reopen the mic
 * only after all speech finishes.
 */
export class TtsPlayer {
  private voiceId: string;
  private enabled: boolean;
  /** Local mirror of the Rust sink state, updated by tts-playing/tts-idle. */
  private sinkState: TtsPlayerState = "idle";
  /** Whether we're actively fetching/appending sentences (some turn is draining). */
  private draining = false;
  /** The public state we report to listeners (playing while draining OR sink busy OR queued). */
  private state: TtsPlayerState = "idle";
  /** Per-turn queues, keyed by turnId. Retired when ended && empty. */
  private turns = new Map<string, TurnRecord>();
  /** FIFO of turnIds by first-seen. Head is the currently-draining turn. */
  private turnOrder: string[] = [];
  private abortController: AbortController | null = null;
  private stateListeners = new Set<(state: TtsPlayerState) => void>();
  private idleWaiters = new Set<() => void>();
  private unlistenPlaying: UnlistenFn | null = null;
  private unlistenIdle: UnlistenFn | null = null;
  /** Coarse level for the HUD orb's "speaking" pulse (no webview analyser). */
  private eventsWired = false;
  /** Offline fallback voice (macOS `say` / SpeechSynthesis). */
  private localSpeech: LocalSpeech;
  /** Current voice health; flips to degraded on the first ElevenLabs failure. */
  private voiceStatus: VoiceStatus = { state: "ok" };
  private voiceStatusListeners = new Set<(status: VoiceStatus) => void>();

  constructor(
    voiceId = DEFAULT_VOICE_ID,
    enabled = true,
    localSpeechBackends: LocalSpeechBackends = defaultLocalSpeechBackends(),
  ) {
    this.voiceId = voiceId;
    this.enabled = enabled;
    this.localSpeech = new LocalSpeech(localSpeechBackends);
    void this.wireRustEvents();
  }

  /**
   * Subscribe to voice-health transitions (ok ↔ degraded). Fires immediately
   * with the current status. The HUD uses this to show/hide the "voice
   * degraded" indicator.
   */
  onVoiceStatusChange(fn: (status: VoiceStatus) => void): () => void {
    this.voiceStatusListeners.add(fn);
    fn(this.voiceStatus);
    return () => {
      this.voiceStatusListeners.delete(fn);
    };
  }

  /** Current voice health. */
  getVoiceStatus(): VoiceStatus {
    return this.voiceStatus;
  }

  private setVoiceStatus(next: VoiceStatus): void {
    if (
      next.state === this.voiceStatus.state &&
      next.reason === this.voiceStatus.reason
    ) {
      return;
    }
    this.voiceStatus = next;
    for (const fn of this.voiceStatusListeners) fn(next);
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
   * have sentences to fetch/append across any live turn. It is "idle" only
   * when the sink has drained, no drain loop is running, and every turn is
   * retired. This guarantees the FSM never leaves "speaking" prematurely, and
   * (paired with eager retirement of ended-empty turns) never gets stuck.
   */
  private hasPending(): boolean {
    for (const turnId of this.turnOrder) {
      const t = this.turns.get(turnId);
      if (t && t.sentences.length > 0) return true;
    }
    return false;
  }

  private recomputeState(): void {
    const next: TtsPlayerState =
      this.sinkState === "playing" || this.draining || this.hasPending()
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

  /** Get or create the per-turn record; append to turnOrder on first sight. */
  private turnFor(turnId: string): TurnRecord {
    let t = this.turns.get(turnId);
    if (!t) {
      t = { sentences: [], nextSeq: 0, ended: false };
      this.turns.set(turnId, t);
      this.turnOrder.push(turnId);
    }
    return t;
  }

  /**
   * Enqueue a sentence for playback within a specific turn. Sentences within a
   * turn play in seq order (gaps within a turn wait for fills); turns play in
   * first-seen order (never interleaved). Enqueuing against a new turnId
   * appends it to the FIFO — the routine opener arriving before the brief will
   * always play first.
   */
  enqueueSentence(turnId: string, text: string, seq: number): void {
    if (!this.enabled || !text.trim()) return;

    const turn = this.turnFor(turnId);
    turn.sentences.push({ text, seq });
    turn.sentences.sort((a, b) => a.seq - b.seq);
    this.recomputeState();
    this.drain();
  }

  /**
   * Signal that no further sentences will arrive for this turn. Once the
   * turn's queue drains, it retires and the next turn in the FIFO begins. A
   * turn ended with zero sentences retires immediately so it never blocks
   * later turns (e.g. a tool-only turn).
   */
  endTurn(turnId: string): void {
    const turn = this.turns.get(turnId);
    if (!turn) {
      // Never saw a sentence for this turnId — nothing to retire.
      return;
    }
    turn.ended = true;
    // Kick the drain so an ended-empty head turn can retire and unblock the queue.
    this.drain();
    this.recomputeState();
  }

  /** Monotonic counter for speakNow turnIds — avoids Date.now() collisions. */
  private speakNowCounter = 0;

  /**
   * Speak a single canned line immediately (e.g. the FSM sign-off "Standing by,
   * sir.", or the confirm-gate failure line). Synthesizes a one-shot turnId so
   * the line plays on its own, ordered after any already-queued turns.
   *
   * Trade-off: if a live head turn is orphaned (never got response-end, e.g.
   * SSE mid-turn drop), speakNow will wait behind it until the FSM safety cap
   * calls stop(). That's acceptable — the alternative (priority-jumping the
   * head turn) risks cutting off legitimate in-flight speech. Callers who need
   * hard preemption should call stop() themselves first.
   */
  speakNow(text: string): void {
    if (!this.enabled || !text.trim()) return;
    const turnId = `now-${Date.now()}-${this.speakNowCounter++}`;
    this.enqueueSentence(turnId, text, 0);
    this.endTurn(turnId);
  }

  /** Stop all playback immediately and clear every turn queue. */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Interrupt the local fallback voice too — same barge-in/new-turn semantics
    // as ElevenLabs playback (a running `say` child is killed immediately).
    this.localSpeech.stop();
    this.turns.clear();
    this.turnOrder = [];
    this.draining = false;
    // Tell Rust to stop + clear its sink. `tts_stop` emits `tts-idle`, but we
    // also optimistically set idle here so state is correct even outside Tauri.
    void invoke("tts_stop").catch(() => {
      // Not under Tauri (or command missing) — state still advances below.
    });
    this.sinkState = "idle";
    this.recomputeState();
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
    // Play the head turn's next expected sentence; retire ended-empty turns
    // eagerly and move to the next. Stop when we hit an in-progress head turn
    // that has no ready sentence (waiting on a gap fill or on more chunks —
    // the next enqueue restarts the drain).
    for (;;) {
      const headId = this.turnOrder[0];
      if (!headId) return; // no turns pending
      const head = this.turns.get(headId);
      if (!head) {
        // Defensive: turnOrder out of sync with turns map — drop and continue.
        this.turnOrder.shift();
        continue;
      }
      const next = head.sentences[0];
      if (next && next.seq === head.nextSeq) {
        head.sentences.shift();
        head.nextSeq++;
        await this.playSentence(next.text);
        continue;
      }
      // No ready sentence for the head turn.
      if (head.ended && head.sentences.length === 0) {
        // Retire an ended-empty turn (including turns ended with zero sentences).
        this.turns.delete(headId);
        this.turnOrder.shift();
        continue;
      }
      // Head turn is still live and either awaiting a seq gap fill or more
      // chunks. Yield — enqueue/endTurn will restart the drain.
      return;
    }
  }

  /** Fetch a sentence's PCM and append it to the Rust sink (FIFO order). */
  private async playSentence(text: string): Promise<void> {
    const { apiBaseUrl, triggerSecret } = getEnv();
    const ac = new AbortController();
    this.abortController = ac;

    // Auth, in priority order (the server checks Bearer first):
    //   1. Bearer device token → resolves the user's own BYOK ElevenLabs key.
    //   2. x-trigger-secret → owner env fallback (process.env.ELEVENLABS_API_KEY).
    // The Bearer path is canonical: it's how every other desktop→server call
    // authenticates, and it works whenever a device token is paired (which it
    // must be for capture/SSE anyway). The trigger secret is only a fallback and
    // is empty unless VITE_PHYSICAL_TRIGGER_SECRET is set — so relying on it
    // alone made every TTS request 401 and nothing spoke.
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-trigger-secret": triggerSecret,
    };
    const token = await getDeviceToken();
    if (token) headers["authorization"] = `Bearer ${token}`;

    try {
      const res = await fetch(`${apiBaseUrl}/api/jarvis/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceId: this.voiceId }),
        signal: ac.signal as AbortSignal,
      });

      if (!res.ok) {
        // ElevenLabs failed (typically 502 — dead/missing key or a transient
        // upstream blip). Instead of going silently mute, SPEAK THIS SENTENCE
        // through the local fallback voice and flip the HUD to "voice
        // degraded". The route's JSON body carries a machine-readable reason.
        const reason = await readTtsFailureReason(res);
        console.warn(
          `[tts] server returned ${res.status} (${reason ?? "unknown"}) — local fallback`,
        );
        this.setVoiceStatus({ state: "degraded", ...(reason ? { reason } : {}) });
        this.abortController = null;
        await this.localSpeech.speak(text);
        return;
      }

      // Raw 16-bit signed LE PCM @ 24 kHz mono. Hand the bytes straight to Rust.
      const pcmBytes = new Uint8Array(await res.arrayBuffer());
      if (!pcmBytes.byteLength) return;

      // ElevenLabs is speaking again — clear any prior degraded state.
      this.setVoiceStatus({ state: "ok" });
      // `bytes` must be a plain number[] so Tauri's IPC serialises it as a
      // Vec<u8>. Array.from on a typed array is exact and cheap enough here.
      await invoke("tts_play_pcm", { bytes: Array.from(pcmBytes) });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "AbortError") return; // cancelled by stop()
      // Network-level failure (server unreachable, etc.): still speak locally so
      // JARVIS is never mute, and mark the voice degraded (transient).
      console.error("[tts] playSentence failed — local fallback", err);
      this.setVoiceStatus({ state: "degraded", reason: "transient" });
      this.abortController = null;
      await this.localSpeech.speak(text);
    } finally {
      this.abortController = null;
    }
  }
}

/**
 * Read the machine-readable `reason` from a failed TTS response body. Best
 * effort: a non-JSON or reasonless body yields undefined (still treated as a
 * degraded/transient failure by the caller).
 */
async function readTtsFailureReason(
  res: Response,
): Promise<VoiceStatus["reason"] | undefined> {
  try {
    const body = (await res.clone().json()) as { reason?: unknown };
    const reason = body?.reason;
    if (reason === "key_missing" || reason === "auth" || reason === "transient") {
      return reason;
    }
  } catch {
    // Non-JSON body (e.g. a plain "Unauthorized" string) — leave undefined.
  }
  return undefined;
}
