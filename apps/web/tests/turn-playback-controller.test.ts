/**
 * TurnPlaybackController (LAT-02 + LAT-03 + D-01 + D-04 + D-06) — unit tests.
 *
 * Phase 10 Plan 10-04 Task 1.
 *
 * Verifies the per-turn playback orchestrator that drives per-sentence TTS
 * dispatch, in-flight AbortController set, AudioQueue lifecycle, and fallback
 * policy. 10 behaviors:
 *
 *   1. playSentence(0) fetches /api/jarvis/tts with the right body.
 *   2. Pipelined dispatch — playSentence(0) and playSentence(1) fire
 *      fetches concurrently (D-01).
 *   3. In-order playback — seq 1's enqueue waits for seq 0's enqueue gate
 *      even when seq 1's fetch resolves first (D-01 strict-order guarantee).
 *   4. tts_first_byte_at fires once per turn on the FIRST sentence (D-06).
 *   5. stop() aborts every in-flight fetch + flushes AudioQueue + fires
 *      onEnd exactly once (D-04 stop-all).
 *   6. Fallback policy — sentence 0 fails → SpeechSynthesis for whole turn.
 *   7. Fallback policy — sentence ≥ 1 fails after sentence 0 played: silent
 *      drop + console.warn; no SpeechSynthesis fallback.
 *   8. endOfTurn fires onEnd after all in-flight drain.
 *   9. endOfTurn does NOT fire onEnd while in-flight is still pending.
 *  10. 8s per-sentence timeout aborts a slow fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — collectStage is spied so we can assert one-shot semantics.
// ---------------------------------------------------------------------------

const collectStageMock = vi.fn();
vi.mock("@/lib/voice/voice-stage-collector", () => ({
  collectStage: (...args: unknown[]) => collectStageMock(...args),
}));

// ---------------------------------------------------------------------------
// Fake AudioContext — same shape as audio-queue-pcm.test.ts.
// AudioQueue is the real module; we feed it a fake ctx so enqueue() works.
// ---------------------------------------------------------------------------

interface FakeBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  copyToChannel: ReturnType<typeof vi.fn>;
}

interface FakeSourceNode {
  buffer: FakeBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

interface FakeCtx {
  currentTime: number;
  destination: object;
  createBuffer: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createAnalyser: ReturnType<typeof vi.fn>;
}

function makeFakeCtx(): FakeCtx {
  return {
    currentTime: 0,
    destination: { __destination: true },
    createBuffer: vi.fn(
      (channels: number, length: number, sampleRate: number): FakeBuffer => ({
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        copyToChannel: vi.fn(),
      }),
    ),
    createBufferSource: vi.fn((): FakeSourceNode => {
      const node: FakeSourceNode = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      return node;
    }),
    createAnalyser: vi.fn(() => ({ fftSize: 256, connect: vi.fn() })),
  };
}

// ---------------------------------------------------------------------------
// Fake SpeechSynthesis — jsdom doesn't ship it.
// ---------------------------------------------------------------------------

interface FakeUtterance {
  text: string;
  voice: unknown;
  onstart: (() => void) | null;
  onend: (() => void) | null;
}

let speakMock: ReturnType<typeof vi.fn>;
let cancelMock: ReturnType<typeof vi.fn>;
let lastUtterance: FakeUtterance | null = null;

function installSpeechSynthesis(): void {
  speakMock = vi.fn((u: FakeUtterance) => {
    lastUtterance = u;
    // Fire onstart/onend synchronously so onEnd cycles in the controller's
    // fallback path (tests that need different timing should override).
    setTimeout(() => {
      u.onstart?.();
      u.onend?.();
    }, 0);
  });
  cancelMock = vi.fn();
  // Install onto window/global.
  (globalThis as unknown as { window?: typeof globalThis }).window =
    globalThis as unknown as typeof globalThis;
  (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
    speak: speakMock,
    cancel: cancelMock,
    getVoices: () => [{ lang: "en-GB", name: "FakeBritish" }],
  };
  // Make `window.speechSynthesis` resolve to the same object.
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    value: class {
      text: string;
      voice: unknown = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis.window, "speechSynthesis", {
    value: (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis,
    configurable: true,
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Fake fetch helper — returns a Response-like with a ReadableStream body.
// ---------------------------------------------------------------------------

function makeStreamingResponse(
  chunks: Uint8Array[],
  opts: { status?: number; ok?: boolean; chunkDelayMs?: number } = {},
): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const chunkDelayMs = opts.chunkDelayMs ?? 0;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const c of chunks) {
        if (chunkDelayMs > 0) {
          await new Promise((r) => setTimeout(r, chunkDelayMs));
        }
        controller.enqueue(c);
      }
      controller.close();
    },
  });
  // Cast to Response — only the props we use need to be present.
  return {
    status,
    ok,
    body,
    headers: new Headers(),
  } as unknown as Response;
}

function pcmBytes(samples: number[]): Uint8Array {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i], true);
  }
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TurnPlaybackController (LAT-02 + LAT-03 + D-01 + D-04 + D-06)", () => {
  beforeEach(() => {
    collectStageMock.mockReset();
    installSpeechSynthesis();
    lastUtterance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("playSentence(0) POSTs to /api/jarvis/tts with text + voiceId", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(makeStreamingResponse([pcmBytes([0, 1000])])),
      );
    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const ctrl = new TurnPlaybackController({
      voiceId: "VOICE_X",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart,
      onEnd,
    });

    await ctrl.playSentence("Hello.", 0);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/jarvis/tts");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.text).toBe("Hello.");
    expect(body.voiceId).toBe("VOICE_X");
  });

  it("pipelined dispatch — playSentence(0) and playSentence(1) fire fetches concurrently", async () => {
    let inFlightPeak = 0;
    let inFlightNow = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      inFlightNow++;
      inFlightPeak = Math.max(inFlightPeak, inFlightNow);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlightNow--;
          resolve(makeStreamingResponse([pcmBytes([0, 1000])]));
        }, 50);
      });
    });

    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd: vi.fn(),
    });

    const p0 = ctrl.playSentence("Sentence zero.", 0);
    const p1 = ctrl.playSentence("Sentence one.", 1);
    await Promise.all([p0, p1]);

    // Both fetches must have been initiated and overlapped.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(inFlightPeak).toBeGreaterThanOrEqual(2);
  });

  it("in-order playback — seq 1 enqueue waits for seq 0 enqueue gate even if seq 1 fetch resolves first", async () => {
    // seq 0 fetch resolves slow; seq 1 fetch resolves fast. Both fetches
    // return PCM bytes. Spy on AudioQueue.enqueue to capture call order.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body));
        const isSeq0 = body.text === "ZERO";
        const delayMs = isSeq0 ? 100 : 10;
        return new Promise((resolve) => {
          setTimeout(() => {
            // Encode the seq into the PCM bytes so we can tell them apart in
            // the enqueue capture: seq 0 → samples [1000], seq 1 → samples [2000].
            const sample = isSeq0 ? 1000 : 2000;
            resolve(makeStreamingResponse([pcmBytes([sample, sample])]));
          }, delayMs);
        });
      });

    const { AudioQueue } = await import("@/lib/voice/audio-queue");
    const enqueueSpy = vi.spyOn(AudioQueue.prototype, "enqueue");

    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd: vi.fn(),
    });

    await Promise.all([
      ctrl.playSentence("ZERO", 0),
      ctrl.playSentence("ONE", 1),
    ]);

    // 2 fetches were issued.
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // First enqueue call must have come from seq 0 (sample=1000), even though
    // seq 1's fetch resolved 90ms earlier. Sample-pattern lets us identify
    // the seq.
    expect(enqueueSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    const firstChunk = new Uint8Array(
      enqueueSpy.mock.calls[0][0] as ArrayBuffer,
    );
    const firstSample = new DataView(
      firstChunk.buffer,
      firstChunk.byteOffset,
      firstChunk.byteLength,
    ).getInt16(0, true);
    // seq 0 was encoded as sample=1000; if seq 1 (sample=2000) enqueued
    // first, in-order playback is broken.
    expect(firstSample).toBe(1000);
  });

  it("tts_first_byte_at fires ONCE per turn on the FIRST sentence", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeStreamingResponse([pcmBytes([0, 1000])])),
    );
    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd: vi.fn(),
    });

    await ctrl.playSentence("First.", 0);
    await ctrl.playSentence("Second.", 1);
    await ctrl.playSentence("Third.", 2);

    const ttfbCalls = collectStageMock.mock.calls.filter(
      (args) => args[0] === "tts_first_byte_at",
    );
    expect(ttfbCalls).toHaveLength(1);
    expect(ttfbCalls[0][1]).toBeInstanceOf(Date);
  });

  it("stop() aborts every in-flight fetch + flushes AudioQueue + fires onEnd once", async () => {
    const seenSignals: AbortSignal[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_url, init) => {
        const signal = (init as RequestInit).signal as AbortSignal;
        seenSignals.push(signal);
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
          // Never resolves on its own — only the abort can finish it.
        });
      });

    const { AudioQueue } = await import("@/lib/voice/audio-queue");
    const stopAllSpy = vi.spyOn(AudioQueue.prototype, "stopAll");

    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const onEnd = vi.fn();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd,
    });

    // Kick off two in-flight fetches; don't await yet.
    const p0 = ctrl.playSentence("First.", 0);
    const p1 = ctrl.playSentence("Second.", 1);

    // Give the event loop a tick so fetch() has been called.
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    ctrl.stop();

    await Promise.allSettled([p0, p1]);

    // Both signals must report aborted.
    expect(seenSignals.length).toBe(2);
    expect(seenSignals[0].aborted).toBe(true);
    expect(seenSignals[1].aborted).toBe(true);
    // AudioQueue.stopAll was called.
    expect(stopAllSpy).toHaveBeenCalled();
    // onEnd fires exactly once.
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("fallback policy — sentence 0 fails → SpeechSynthesis for the whole turn", async () => {
    // First fetch returns 502 (upstream-failed sentinel).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        makeStreamingResponse([], { status: 502, ok: false }),
      ),
    );
    // Silence the expected warn.
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd: vi.fn(),
    });

    await ctrl.playSentence("First.", 0);

    // SpeechSynthesis must have been invoked exactly once for sentence 0.
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(lastUtterance?.text).toBe("First.");

    // Now seq 1 — must go through SpeechSynthesis WITHOUT another fetch.
    const fetchCountBefore = fetchSpy.mock.calls.length;
    await ctrl.playSentence("Second.", 1);

    // No new fetch fired.
    expect(fetchSpy.mock.calls.length).toBe(fetchCountBefore);
    // SpeechSynthesis fired again.
    expect(speakMock).toHaveBeenCalledTimes(2);
    expect(lastUtterance?.text).toBe("Second.");
  });

  it("fallback policy — sentence ≥ 1 fails after sentence 0 played: silent drop + console.warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // seq 0 succeeds; seq 1 fails.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      if (body.text === "First.") {
        return Promise.resolve(makeStreamingResponse([pcmBytes([0, 1000])]));
      }
      return Promise.resolve(
        makeStreamingResponse([], { status: 502, ok: false }),
      );
    });

    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd: vi.fn(),
    });

    await ctrl.playSentence("First.", 0);
    await ctrl.playSentence("Second.", 1);

    // Both fetches actually fired (no SpeechSynthesis fallback at the controller).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // SpeechSynthesis must NOT have been used.
    expect(speakMock).not.toHaveBeenCalled();
    // console.warn called for the silently-dropped seq 1.
    const dropWarnCall = warnSpy.mock.calls.find((args) =>
      String(args.join(" ")).includes("silently"),
    );
    expect(dropWarnCall).toBeTruthy();
  });

  it("endOfTurn fires onEnd after all in-flight drain", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeStreamingResponse([pcmBytes([0, 1000])])),
    );
    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const onEnd = vi.fn();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd,
    });

    const p = ctrl.playSentence("First.", 0);
    ctrl.endOfTurn();
    await p;
    // Let microtasks settle (maybeFireOnEnd in finally).
    await Promise.resolve();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("endOfTurn does NOT fire onEnd while in-flight is still pending", async () => {
    let resolveLater: ((r: Response) => void) | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          // Cast through unknown to defeat TS's "narrow let to null because
          // the assignment lives inside a callback" inference.
          (resolveLater as unknown) = resolve;
        }),
    );
    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const onEnd = vi.fn();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd,
    });

    void ctrl.playSentence("First.", 0);
    ctrl.endOfTurn();

    // Give a few ticks for any erroneous maybeFireOnEnd to slip through.
    await new Promise((r) => setTimeout(r, 10));

    // Still pending — onEnd must not have fired yet.
    expect(onEnd).not.toHaveBeenCalled();

    // Cleanup: resolve the dangling fetch so the test doesn't hang.
    (resolveLater as unknown as ((r: Response) => void) | null)?.(
      makeStreamingResponse([pcmBytes([0])]),
    );
  });

  it("8s per-sentence timeout aborts a slow fetch", async () => {
    vi.useFakeTimers();
    let seenSignal: AbortSignal | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      seenSignal = (init as RequestInit).signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        seenSignal!.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { TurnPlaybackController } = await import(
      "@/lib/voice/turn-playback-controller"
    );
    const ctx = makeFakeCtx();
    const ctrl = new TurnPlaybackController({
      voiceId: "V",
      ttsProvider: "elevenlabs",
      audioContext: ctx as unknown as AudioContext,
      onStart: vi.fn(),
      onEnd: vi.fn(),
    });

    const p = ctrl.playSentence("First.", 0);
    // Let the fetch() call register and assign the signal.
    await Promise.resolve();

    // Advance past 8s — the per-sentence timeout fires.
    vi.advanceTimersByTime(8001);
    // Flush microtasks so the abort reject lands.
    await Promise.resolve();
    await Promise.resolve();

    expect(seenSignal).not.toBeNull();
    expect(seenSignal!.aborted).toBe(true);

    // Let the promise resolve so vitest doesn't hang.
    vi.useRealTimers();
    await Promise.allSettled([p]);
  });
});
