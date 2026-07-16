import { describe, expect, it, vi } from "vitest";

import {
  LocalSpeech,
  type LocalSpeechBackends,
  type LocalUtterance,
} from "./local-speech";

/** A controllable utterance: resolve/reject `done` on demand, track kills. */
function makeUtterance(): LocalUtterance & { finish: () => void; killed: () => boolean } {
  let resolve!: () => void;
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  let wasKilled = false;
  return {
    done,
    kill: () => {
      wasKilled = true;
      resolve(); // killing an utterance ends its `done` immediately
    },
    finish: () => resolve(),
    killed: () => wasKilled,
  };
}

describe("LocalSpeech: backend selection", () => {
  it("prefers macOS `say` when available", async () => {
    const sayUtter = makeUtterance();
    const saySpawn = vi.fn(async () => sayUtter);
    const webSpeak = vi.fn(() => makeUtterance());
    const speech = new LocalSpeech({ saySpawn, webSpeak });

    const p = speech.speak("Good evening, sir.");
    sayUtter.finish();
    await expect(p).resolves.toBe(true);

    expect(saySpawn).toHaveBeenCalledWith("Good evening, sir.", "Daniel");
    expect(webSpeak).not.toHaveBeenCalled();
  });

  it("falls back to SpeechSynthesis when `say` is unavailable", async () => {
    const webUtter = makeUtterance();
    const saySpawn = vi.fn(async () => {
      throw new Error("say unavailable (no Tauri)");
    });
    const webSpeak = vi.fn(() => webUtter);
    const speech = new LocalSpeech({ saySpawn, webSpeak });

    const p = speech.speak("Right away, sir.");
    webUtter.finish();
    await expect(p).resolves.toBe(true);
    expect(webSpeak).toHaveBeenCalledWith("Right away, sir.");
  });

  it("returns false when no backend can speak", async () => {
    const speech = new LocalSpeech({
      saySpawn: async () => {
        throw new Error("no say");
      },
      webSpeak: null,
    });
    await expect(speech.speak("Hello")).resolves.toBe(false);
  });

  it("ignores empty/whitespace lines without spawning", async () => {
    const saySpawn = vi.fn(async () => makeUtterance());
    const speech = new LocalSpeech({ saySpawn, webSpeak: null });
    await expect(speech.speak("   ")).resolves.toBe(false);
    expect(saySpawn).not.toHaveBeenCalled();
  });

  it("honours a custom voice", async () => {
    const saySpawn = vi.fn(async () => {
      const u = makeUtterance();
      u.finish();
      return u;
    });
    const speech = new LocalSpeech({ saySpawn, webSpeak: null }, "Arthur");
    await speech.speak("Test");
    expect(saySpawn).toHaveBeenCalledWith("Test", "Arthur");
  });
});

describe("LocalSpeech: interrupt semantics", () => {
  it("stop() kills the in-flight utterance and resolves speak()", async () => {
    const utter = makeUtterance();
    const speech = new LocalSpeech({
      saySpawn: async () => utter,
      webSpeak: null,
    });

    const p = speech.speak("A long sentence that gets interrupted...");
    // Let the spawn resolve and register as current.
    await Promise.resolve();
    speech.stop();

    await expect(p).resolves.toBe(true); // spoke (then interrupted)
    expect(utter.killed()).toBe(true);
  });

  it("a stop() during a pending spawn supersedes the utterance", async () => {
    let resolveSpawn!: (u: LocalUtterance) => void;
    const spawnGate = new Promise<LocalUtterance>((r) => {
      resolveSpawn = r;
    });
    const utter = makeUtterance();
    const speech = new LocalSpeech({
      saySpawn: () => spawnGate,
      webSpeak: null,
    });

    const p = speech.speak("Superseded before it even starts");
    // stop() fires while saySpawn is still pending (new turn barged in).
    speech.stop();
    // Now the spawn finally resolves — it must be killed, not played.
    resolveSpawn(utter);

    await expect(p).resolves.toBe(false);
    expect(utter.killed()).toBe(true);
  });

  it("serializes utterances: each speak() awaits completion", async () => {
    const first = makeUtterance();
    const second = makeUtterance();
    const queue = [first, second];
    const speech = new LocalSpeech({
      saySpawn: async () => queue.shift()!,
      webSpeak: null,
    });

    let firstDone = false;
    const p1 = speech.speak("one").then(() => {
      firstDone = true;
    });
    // Second hasn't been requested yet; drive them in order like the drain loop.
    first.finish();
    await p1;
    expect(firstDone).toBe(true);

    const p2 = speech.speak("two");
    second.finish();
    await expect(p2).resolves.toBe(true);
  });
});
