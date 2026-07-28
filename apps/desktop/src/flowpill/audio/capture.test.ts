import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activeCapture,
  armPreroll,
  disarmPreroll,
  isFlowpillCaptureActive,
  resetFlowpillAudio,
  startCapture,
  type CaptureOptions,
} from "./capture";
import { constantPcm, makeFakeSource, silentPcm, tonePcm, type FakeSource } from "./test-fixtures";
import type { TranscriptionResult } from "./transcribe";

// The native source reaches into Tauri, which does not exist in a headless test
// process. Every test injects its own source, so this only has to keep the
// import graph clean.
vi.mock("./source", () => ({
  createTauriPcmSource: () => {
    throw new Error("the native source must not be constructed in tests");
  },
  MicBusyError: class MicBusyError extends Error {},
}));

interface Rig {
  mic: FakeSource;
  seen: Array<{ samples: Float32Array; sampleRate: number }>;
  result: TranscriptionResult;
  opts: CaptureOptions;
}

function rig(
  result: TranscriptionResult = { kind: "transcript", text: "add milk to the list" },
  config: CaptureOptions["config"] = {},
  sourceOptions: { failWith?: Error } = {},
): Rig {
  const mic = makeFakeSource(sourceOptions);
  const seen: Array<{ samples: Float32Array; sampleRate: number }> = [];
  const self: Rig = {
    mic,
    seen,
    result,
    opts: {
      createSource: () => mic.source,
      transcribe: async (samples, sampleRate) => {
        seen.push({ samples, sampleRate });
        return self.result;
      },
      config: { micOpenTimeoutMs: 60_000, ...config },
    },
  };
  return self;
}

afterEach(async () => {
  await resetFlowpillAudio();
  vi.useRealTimers();
});

describe("flowpill capture: the happy path", () => {
  it("buffers the whole utterance and transcribes it exactly once", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    for (let i = 0; i < 5; i++) r.mic.emit(tonePcm(1_600));
    expect(r.seen).toHaveLength(0); // nothing is transcribed mid-utterance

    const outcome = await cap.stop();
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]!.samples).toHaveLength(8_000);
    expect(outcome).toEqual({
      kind: "transcript",
      text: "add milk to the list",
      durationMs: 500,
    });
  });

  it("resolves `done` with the same outcome as `stop`", async () => {
    const r = rig();
    const cap = await startCapture("locked", r.opts);
    r.mic.emit(tonePcm(3_200));
    const [stopped, done] = await Promise.all([cap.stop(), cap.done]);
    expect(stopped).toEqual(done);
    expect(cap.isActive()).toBe(false);
  });

  it("records the mode without changing how the buffer behaves", async () => {
    const hold = rig();
    const capA = await startCapture("hold", hold.opts);
    expect(capA.mode).toBe("hold");
    hold.mic.emit(tonePcm(1_600));
    await capA.stop();

    const locked = rig();
    const capB = await startCapture("locked", locked.opts);
    expect(capB.mode).toBe("locked");
    locked.mic.emit(tonePcm(1_600));
    await capB.stop();

    expect(hold.seen[0]!.samples).toHaveLength(locked.seen[0]!.samples.length);
  });

  it("releases the microphone as soon as the utterance ends", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(1_600));
    expect(r.mic.isRunning()).toBe(true);
    await cap.stop();
    expect(r.mic.stops()).toBe(1);
    expect(r.mic.isRunning()).toBe(false);
  });
});

describe("flowpill capture: pre-roll", () => {
  it("prepends the audio captured before the caller said start", async () => {
    const r = rig();
    const armed = await armPreroll(r.opts);
    expect(armed.ok).toBe(true);

    // Spoken into the pre-roll window, before startCapture.
    r.mic.emit(constantPcm(320, 0.4));
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(constantPcm(1_600, 0.2));
    await cap.stop();

    const sent = r.seen[0]!.samples;
    expect(sent).toHaveLength(1_920);
    expect(sent[0]).toBeCloseTo(0.4, 5); // the pre-roll leads
    expect(sent[319]).toBeCloseTo(0.4, 5);
    expect(sent[320]).toBeCloseTo(0.2, 5); // the live utterance follows
  });

  it("keeps only the most recent pre-roll window", async () => {
    const r = rig({ kind: "transcript", text: "x" }, { prerollMs: 100 }); // 1600 samples
    await armPreroll(r.opts);
    r.mic.emit(constantPcm(1_600, 0.4)); // scrolls out
    r.mic.emit(constantPcm(1_600, 0.3)); // survives
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(constantPcm(1_600, 0.2));
    await cap.stop();

    const sent = r.seen[0]!.samples;
    expect(sent).toHaveLength(3_200);
    expect(sent[0]).toBeCloseTo(0.3, 5);
  });

  it("captures fine with no pre-roll armed at all", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(1_600));
    await cap.stop();
    expect(r.seen[0]!.samples).toHaveLength(1_600);
  });

  it("reuses the already-open microphone rather than reopening it", async () => {
    const r = rig();
    await armPreroll(r.opts);
    r.mic.emit(tonePcm(320));
    await startCapture("hold", r.opts);
    expect(r.mic.starts()).toBe(1);
  });

  it("drops the pre-roll and releases the mic on disarm", async () => {
    const r = rig();
    await armPreroll(r.opts);
    r.mic.emit(constantPcm(1_600, 0.4));
    await disarmPreroll();
    expect(r.mic.stops()).toBe(1);

    const cap = await startCapture("hold", r.opts);
    r.mic.emit(constantPcm(1_600, 0.2));
    await cap.stop();
    expect(r.seen[0]!.samples).toHaveLength(1_600);
  });
});

describe("flowpill capture: level and silence signals", () => {
  it("streams normalised levels while recording and settles to zero at the end", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    const levels: number[] = [];
    cap.onLevel((level) => levels.push(level));

    r.mic.emit(silentPcm(3_200));
    expect(levels).toHaveLength(10); // 3200 / 320 windows
    expect(levels.every((l) => l === 0)).toBe(true);

    r.mic.emit(constantPcm(3_200, 0.2));
    expect(levels.slice(10).every((l) => l > 0 && l <= 1)).toBe(true);

    await cap.stop();
    expect(levels.at(-1)).toBe(0);
  });

  it("unsubscribes cleanly", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    const levels: number[] = [];
    const off = cap.onLevel((level) => levels.push(level));
    r.mic.emit(tonePcm(320));
    off();
    r.mic.emit(tonePcm(3_200));
    expect(levels).toHaveLength(1);
    await cap.stop();
  });

  it("reports a silence hint but never ends the utterance itself", async () => {
    const r = rig({ kind: "transcript", text: "x" }, { silenceHintMs: 200 });
    const cap = await startCapture("locked", r.opts);
    const hints: number[] = [];
    cap.onSilence((ms) => hints.push(ms));

    r.mic.emit(tonePcm(1_600));
    r.mic.emit(silentPcm(1_600)); // 100ms, under the hint window
    expect(hints).toHaveLength(0);
    r.mic.emit(silentPcm(1_600)); // 200ms, crosses it
    expect(hints).toEqual([200]);

    // Ten more seconds of silence: still recording, because only the caller ends
    // an utterance.
    for (let i = 0; i < 100; i++) r.mic.emit(silentPcm(1_600));
    expect(cap.isActive()).toBe(true);
    expect(isFlowpillCaptureActive()).toBe(true);
    await cap.stop();
  });
});

describe("flowpill capture: outcomes that must not reach JARVIS", () => {
  it("cancels without transcribing anything", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(3_200));
    await expect(cap.cancel()).resolves.toEqual({ kind: "cancelled" });
    expect(r.seen).toHaveLength(0);
    expect(r.mic.stops()).toBe(1);
  });

  it("honours a cancel that lands while the transcript request is in flight", async () => {
    const r = rig();
    let release!: (value: TranscriptionResult) => void;
    const inFlight = new Promise<TranscriptionResult>((resolve) => {
      release = resolve;
    });
    r.opts.transcribe = () => inFlight;

    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(3_200));
    const stopping = cap.stop();
    const cancelling = cap.cancel();
    release({ kind: "transcript", text: "should be discarded" });

    await expect(stopping).resolves.toEqual({ kind: "cancelled" });
    await expect(cancelling).resolves.toEqual({ kind: "cancelled" });
  });

  it("never sends a silent buffer to the transcriber", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(silentPcm(16_000));
    const outcome = await cap.stop();
    expect(r.seen).toHaveLength(0);
    expect(outcome).toEqual({ kind: "empty", reason: "silence", durationMs: 1_000 });
  });

  it("reports a blank transcript as empty rather than as text", async () => {
    const r = rig({ kind: "empty" });
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(3_200));
    const outcome = await cap.stop();
    expect(outcome).toEqual({ kind: "empty", reason: "blank-transcript", durationMs: 200 });
  });

  it("surfaces a failed transcript request with its status", async () => {
    const r = rig({ kind: "failed", message: "transcript request 503", status: 503 });
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(3_200));
    await expect(cap.stop()).resolves.toEqual({
      kind: "stt-failed",
      message: "transcript request 503",
      status: 503,
    });
  });

  it("turns a transcriber that throws into an stt-failed outcome", async () => {
    const r = rig();
    r.opts.transcribe = async () => {
      throw new Error("kaboom");
    };
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(3_200));
    await expect(cap.stop()).resolves.toEqual({ kind: "stt-failed", message: "kaboom" });
  });
});

describe("flowpill capture: microphone trouble", () => {
  it("reports a microphone that refuses to open, without throwing", async () => {
    const r = rig({ kind: "empty" }, {}, { failWith: new Error("permission denied") });
    const cap = await startCapture("hold", r.opts);
    expect(cap.isActive()).toBe(false);
    await expect(cap.done).resolves.toEqual({
      kind: "mic-denied",
      message: "permission denied",
    });
    expect(r.seen).toHaveLength(0);
  });

  it("reports a microphone that opens but never delivers a frame", async () => {
    vi.useFakeTimers();
    const r = rig({ kind: "empty" }, { micOpenTimeoutMs: 500 });
    const cap = await startCapture("hold", r.opts);
    await vi.advanceTimersByTimeAsync(600);
    await expect(cap.done).resolves.toEqual({
      kind: "mic-denied",
      message:
        "the microphone opened but delivered no audio; check System Settings > Privacy & Security > Microphone",
    });
    expect(r.seen).toHaveLength(0);
  });

  it("does not accuse the microphone when frames are arriving", async () => {
    vi.useFakeTimers();
    const r = rig({ kind: "transcript", text: "still here" }, { micOpenTimeoutMs: 500 });
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(1_600));
    await vi.advanceTimersByTimeAsync(600);
    expect(cap.isActive()).toBe(true);
    await expect(cap.stop()).resolves.toMatchObject({ kind: "transcript" });
  });
});

describe("flowpill capture: session bookkeeping", () => {
  it("ignores a re-trigger and hands back the running session", async () => {
    const r = rig();
    const first = await startCapture("hold", r.opts);
    const second = await startCapture("locked", r.opts);
    expect(second).toBe(first);
    expect(r.mic.starts()).toBe(1);
    r.mic.emit(tonePcm(1_600));
    await first.stop();
  });

  it("exposes the running session and forgets it once settled", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    expect(activeCapture()).toBe(cap);
    r.mic.emit(tonePcm(1_600));
    await cap.stop();
    expect(activeCapture()).toBeNull();
    expect(isFlowpillCaptureActive()).toBe(false);
  });

  it("settles once, however many times it is stopped", async () => {
    const r = rig();
    const cap = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(1_600));
    const outcomes = await Promise.all([cap.stop(), cap.stop(), cap.stop()]);
    expect(r.seen).toHaveLength(1);
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[1]).toEqual(outcomes[2]);
  });

  it("runs a second utterance cleanly after the first", async () => {
    const r = rig();
    const first = await startCapture("hold", r.opts);
    r.mic.emit(tonePcm(1_600));
    await first.stop();

    const second = await startCapture("locked", r.opts);
    r.mic.emit(tonePcm(3_200));
    await second.stop();

    expect(r.seen).toHaveLength(2);
    expect(r.seen[1]!.samples).toHaveLength(3_200);
    expect(r.mic.starts()).toBe(2);
    expect(r.mic.stops()).toBe(2);
  });
});
