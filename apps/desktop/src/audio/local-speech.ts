// apps/desktop/src/audio/local-speech.ts
// Local (offline) speech fallback for when ElevenLabs TTS is unavailable, so
// JARVIS is never mute. Two backends, in preference order:
//
//   1. macOS `say` via the Tauri shell plugin — native, offline, and keeps the
//      butler register with a British voice (Daniel). This is the reliable
//      path under Tauri: a hotkey/tray invocation has no in-webview user
//      gesture, so the WKWebView AudioContext stays suspended and browser
//      SpeechSynthesis often won't fire. `say` sidesteps that entirely.
//   2. Web `SpeechSynthesis` — used only outside Tauri (plain vite dev / tests
//      where the shell plugin is absent), where a user gesture is present.
//
// Interrupt semantics mirror ElevenLabs playback: `stop()` kills the running
// `say` child and cancels any SpeechSynthesis utterance immediately, so a new
// turn or barge-in silences the fallback just like the primary path. Each
// `speak()` resolves only when its utterance FINISHES (or is stopped), so the
// TtsPlayer drain plays fallback sentences one at a time, in order.

import { Command, type Child } from "@tauri-apps/plugin-shell";

/** UK butler register — Daniel is the stock British male voice on macOS. */
export const LOCAL_SAY_VOICE = "Daniel";

/** A started utterance: `done` resolves on completion, `kill` interrupts it. */
export interface LocalUtterance {
  done: Promise<void>;
  kill: () => void;
}

/** Injectable backends so the state machine is unit-testable without Tauri. */
export interface LocalSpeechBackends {
  /** Speak via macOS `say`. Rejects if `say` is unavailable (e.g. not under
   *  Tauri) so we fall through to SpeechSynthesis. */
  saySpawn: (text: string, voice: string) => Promise<LocalUtterance>;
  /** Web SpeechSynthesis fallback. Null when unavailable. */
  webSpeak: ((text: string) => LocalUtterance) | null;
}

/** Default backend: macOS `say` via Tauri shell, web SpeechSynthesis otherwise. */
export function defaultLocalSpeechBackends(): LocalSpeechBackends {
  return {
    async saySpawn(text, voice) {
      // `say-voice` scope: cmd "say", args ["-v", <voice>, <text>]. Spawn (not
      // execute) so we hold a Child to kill() on barge-in; the `close`/`error`
      // events resolve `done` when the utterance finishes.
      const cmd = Command.create("say-voice", ["-v", voice, text]);
      const child: Child = await cmd.spawn();
      const done = new Promise<void>((resolve) => {
        cmd.on("close", () => resolve());
        cmd.on("error", () => resolve());
      });
      return { done, kill: () => void child.kill() };
    },
    webSpeak:
      typeof globalThis !== "undefined" &&
      typeof (globalThis as { speechSynthesis?: unknown }).speechSynthesis !== "undefined"
        ? (text: string) => {
            const synth = (globalThis as unknown as { speechSynthesis: SpeechSynthesis })
              .speechSynthesis;
            const utter = new SpeechSynthesisUtterance(text);
            // Prefer a British English voice to keep the register.
            const uk = synth
              .getVoices()
              .find((v) => /en-GB/i.test(v.lang) || /daniel|arthur|british/i.test(v.name));
            if (uk) utter.voice = uk;
            const done = new Promise<void>((resolve) => {
              utter.onend = () => resolve();
              utter.onerror = () => resolve();
            });
            synth.cancel();
            synth.speak(utter);
            return { done, kill: () => synth.cancel() };
          }
        : null,
  };
}

/**
 * Serial local-speech player. One utterance at a time; `speak()` resolves when
 * the utterance ends, and `stop()` interrupts the current one immediately.
 * Failures never throw to the caller — a dead fallback just goes quiet rather
 * than wedging the TTS drain.
 */
export class LocalSpeech {
  private backends: LocalSpeechBackends;
  private voice: string;
  /** The currently-speaking utterance (for interruption). */
  private current: LocalUtterance | null = null;
  /** Bumped on every stop() so a late-resolving spawn knows it was superseded. */
  private generation = 0;

  constructor(backends: LocalSpeechBackends, voice = LOCAL_SAY_VOICE) {
    this.backends = backends;
    this.voice = voice;
  }

  /**
   * Speak one line locally, resolving once it finishes (or is stopped). Tries
   * `say` first, falling back to SpeechSynthesis if `say` is unavailable.
   * Returns true if something spoke, false if no backend could.
   */
  async speak(text: string): Promise<boolean> {
    const line = text.trim();
    if (!line) return false;
    const gen = ++this.generation;

    // Backend 1: macOS `say`.
    let utterance: LocalUtterance | null = null;
    try {
      utterance = await this.backends.saySpawn(line, this.voice);
    } catch {
      // `say` unavailable (not under Tauri) — fall through to web.
      utterance = null;
    }

    // Backend 2: web SpeechSynthesis.
    if (!utterance && this.backends.webSpeak) {
      try {
        utterance = this.backends.webSpeak(line);
      } catch {
        utterance = null;
      }
    }
    if (!utterance) return false;

    // A stop() that fired while we were awaiting the spawn supersedes us: kill
    // immediately so a superseded line never speaks over the new turn.
    if (gen !== this.generation) {
      utterance.kill();
      return false;
    }
    this.current = utterance;
    await utterance.done;
    if (this.current === utterance) this.current = null;
    return true;
  }

  /** Interrupt any in-flight local utterance (barge-in / new turn / disable). */
  stop(): void {
    this.generation++;
    const utterance = this.current;
    this.current = null;
    if (utterance) {
      try {
        utterance.kill();
      } catch {
        // Best-effort — a failed kill must never throw into the TTS path.
      }
    }
  }
}
