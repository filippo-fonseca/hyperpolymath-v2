// apps/desktop/src/audio/local-speech.ts
// Local (offline) speech fallback for when ElevenLabs TTS is unavailable, so
// JARVIS is never mute. Two backends, in preference order:
//
//   1. macOS `say` via the native Rust command `speak_fallback` — offline, and
//      keeps the butler register with a British voice (Daniel). This is the
//      reliable path under Tauri: a hotkey/tray invocation has no in-webview
//      user gesture, so the WKWebView AudioContext stays suspended and browser
//      SpeechSynthesis often won't fire. Native `say` sidesteps that entirely.
//
//      NOTE: this used to shell out via the Tauri shell plugin
//      (`Command.create("say-voice", ...)`), but that scoped command never
//      registered at runtime ("Scoped command say-voice not found"), so the
//      fallback silently fell through to SpeechSynthesis. The dedicated Rust
//      command owns the `say` child directly — see src-tauri/src/say.rs.
//   2. Web `SpeechSynthesis` — used only outside Tauri (plain vite dev / tests
//      where the native command is absent), where a user gesture is present.
//
// Interrupt semantics mirror ElevenLabs playback: `stop()` kills the running
// `say` child and cancels any SpeechSynthesis utterance immediately, so a new
// turn or barge-in silences the fallback just like the primary path. Each
// `speak()` resolves only when its utterance FINISHES (or is stopped), so the
// TtsPlayer drain plays fallback sentences one at a time, in order.

import { invoke } from "@tauri-apps/api/core";

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

/** Default backend: native macOS `say` (Rust command), web SpeechSynthesis otherwise. */
export function defaultLocalSpeechBackends(): LocalSpeechBackends {
  return {
    async saySpawn(text, voice) {
      // Native `speak_fallback` (src-tauri/src/say.rs) owns the `say` child and
      // RESOLVES when the utterance finishes — so the invoke promise IS `done`.
      // Barge-in is `speak_fallback_stop`, which kills the tracked child and
      // makes the pending invoke resolve.
      //
      // We kick the invoke immediately and keep its promise as `done` (it settles
      // on true utterance completion, or on barge-in). We must NOT await the whole
      // utterance here — LocalSpeech registers the returned utterance as the
      // current one and awaits `done` itself. But we DO need saySpawn to THROW
      // when native `say` is unavailable (off-Tauri, or non-macOS where the
      // command returns Err fast) so LocalSpeech falls through to SpeechSynthesis.
      //
      // Resolution: race the invoke against a next-tick sentinel. A native `say`
      // that's actually speaking stays pending well past the tick, so the sentinel
      // wins and we return the utterance with `done` still tracking completion. An
      // immediate rejection (missing command / non-macOS Err) settles before or at
      // the tick — we detect it and throw. False-negative risk is nil because a
      // real utterance takes far longer than a microtask+timer to finish.
      let rejectedEarly = false;
      const call = invoke<void>("speak_fallback", { text, voice });
      const done = call.then(
        () => undefined,
        () => undefined,
      );
      call.catch(() => {
        rejectedEarly = true;
      });
      // Yield a macrotask so a synchronous/near-synchronous rejection is observed.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (rejectedEarly) throw new Error("native say unavailable");
      return {
        done,
        kill: () => void invoke("speak_fallback_stop").catch(() => {}),
      };
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
