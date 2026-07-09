import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cueForEvent,
  playCue,
  STUDIO_CUES,
  type StudioAudioEvent,
  type StudioCueId,
} from "@/lib/studio/audio/cues";
import {
  createStudioAudio,
  type StudioAudioContextLike,
} from "@/lib/studio/audio/synth";
import {
  __resetAudioSettings,
  getMuted,
  setMuted,
  subscribeMuted,
  toggleMuted,
} from "@/lib/studio/state/audio-settings";
import type { StudioIntent, StudioPhaseEvent } from "@/lib/studio/input/types";

// ---- Fake AudioContext -----------------------------------------------------
// A plain graph of vi.fn nodes so we can assert scheduling without real audio.

function makeParam(initial = 0) {
  return {
    value: initial,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function makeFakeContext() {
  const oscillators: ReturnType<typeof makeOsc>[] = [];
  const gains: ReturnType<typeof makeGain>[] = [];
  const filters: ReturnType<typeof makeFilter>[] = [];
  const sources: ReturnType<typeof makeSource>[] = [];

  function makeOsc() {
    return {
      type: "sine" as OscillatorType,
      frequency: makeParam(440),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  function makeGain() {
    return { gain: makeParam(1), connect: vi.fn(), disconnect: vi.fn() };
  }
  function makeFilter() {
    return {
      type: "lowpass" as BiquadFilterType,
      frequency: makeParam(350),
      Q: makeParam(1),
      connect: vi.fn(),
    };
  }
  function makeSource() {
    return {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  const ctx = {
    currentTime: 0,
    state: "suspended" as string,
    sampleRate: 44100,
    destination: {} as AudioNode,
    resume: vi.fn(() => {
      ctx.state = "running";
    }),
    createGain: vi.fn(() => {
      const g = makeGain();
      gains.push(g);
      return g;
    }),
    createOscillator: vi.fn(() => {
      const o = makeOsc();
      oscillators.push(o);
      return o;
    }),
    createBiquadFilter: vi.fn(() => {
      const f = makeFilter();
      filters.push(f);
      return f;
    }),
    createBufferSource: vi.fn(() => {
      const s = makeSource();
      sources.push(s);
      return s;
    }),
    createBuffer: vi.fn((_ch: number, length: number, sampleRate: number) => ({
      getChannelData: () => new Float32Array(length),
      length,
      sampleRate,
    })),
    close: vi.fn(),
  };

  return { ctx: ctx as unknown as StudioAudioContextLike, oscillators, gains, filters, sources, raw: ctx };
}

// ---- Resolver --------------------------------------------------------------

const CUE_IDS: StudioCueId[] = [
  "open",
  "close",
  "swipe",
  "halt",
  "grab",
  "zoneTick",
  "drop",
  "rowSwap",
  "handoff",
];

function intentEvent(intent: StudioIntent): StudioAudioEvent {
  return { source: "intent", intent };
}
function phaseEvent(phase: StudioPhaseEvent): StudioAudioEvent {
  return { source: "phase", phase };
}

describe("cueForEvent resolver", () => {
  it("maps every intent to its cue", () => {
    expect(cueForEvent(intentEvent({ type: "expand", targetId: "w1" }))).toBe("open");
    expect(cueForEvent(intentEvent({ type: "collapse" }))).toBe("close");
    expect(cueForEvent(intentEvent({ type: "swipeLeft" }))).toBe("swipe");
    expect(cueForEvent(intentEvent({ type: "swipeRight" }))).toBe("swipe");
    expect(cueForEvent(intentEvent({ type: "halt" }))).toBe("halt");
  });

  it("maps grab phases to grab/drop and silences the rest", () => {
    expect(cueForEvent(phaseEvent({ type: "grabStart", targetId: "w1" }))).toBe("grab");
    expect(cueForEvent(phaseEvent({ type: "grabEnd" }))).toBe("drop");
    expect(cueForEvent(phaseEvent({ type: "grabMove", nx: 0.5, ny: 0.5 }))).toBeNull();
    expect(cueForEvent(phaseEvent({ type: "dragStart" }))).toBeNull();
    expect(cueForEvent(phaseEvent({ type: "dragMove", dx: 1, dy: 1, dz: 0 }))).toBeNull();
    expect(cueForEvent(phaseEvent({ type: "dragEnd" }))).toBeNull();
  });

  it("maps the store-derived events", () => {
    expect(cueForEvent({ source: "zoneTick" })).toBe("zoneTick");
    expect(cueForEvent({ source: "rowSwap" })).toBe("rowSwap");
    expect(cueForEvent({ source: "handoff" })).toBe("handoff");
  });
});

describe("STUDIO_CUES table", () => {
  it("has a non-empty spec for every cue id", () => {
    for (const id of CUE_IDS) {
      expect(STUDIO_CUES[id]).toBeDefined();
      expect(STUDIO_CUES[id].length).toBeGreaterThan(0);
    }
  });

  it("keeps every voice short (< 0.2s) — the 'subtle cue' contract", () => {
    for (const id of CUE_IDS) {
      for (const voice of STUDIO_CUES[id]) {
        expect(voice.dur).toBeLessThanOrEqual(0.2);
        expect(voice.gain).toBeGreaterThan(0);
      }
    }
  });
});

// ---- Synth engine ----------------------------------------------------------

describe("createStudioAudio engine", () => {
  it("is inert (no throw, not ready) with no factory and no window.AudioContext", () => {
    // jsdom provides `window` but no `AudioContext`, so the default factory is null.
    const engine = createStudioAudio();
    expect(() => {
      engine.resume();
      engine.play({ kind: "osc", type: "sine", freq: 440, dur: 0.1, gain: 0.5 });
      engine.setMuted(true);
    }).not.toThrow();
    expect(engine.isReady()).toBe(false);
  });

  it("creates exactly one context on resume and resumes it when suspended", () => {
    const fake = makeFakeContext();
    const factory = vi.fn(() => fake.ctx);
    const engine = createStudioAudio({ contextFactory: factory });

    expect(engine.isReady()).toBe(false);
    engine.resume();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.raw.resume).toHaveBeenCalledTimes(1);
    expect(engine.isReady()).toBe(true);

    // Second resume: context is cached and already running → no new context, no re-resume.
    engine.resume();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.raw.resume).toHaveBeenCalledTimes(1);
  });

  it("sets a low default master gain (0.18)", () => {
    const fake = makeFakeContext();
    const engine = createStudioAudio({ contextFactory: () => fake.ctx });
    engine.resume();
    // The master gain is the first gain node created.
    expect(fake.gains[0]?.gain.value).toBeCloseTo(0.18);
  });

  it("blip creates an oscillator + gain and schedules an envelope + stop", () => {
    const fake = makeFakeContext();
    const engine = createStudioAudio({ contextFactory: () => fake.ctx });
    engine.resume();
    const oscBefore = fake.oscillators.length;

    engine.blip({ kind: "osc", type: "sine", freq: 520, sweepTo: 880, dur: 0.14, gain: 0.5 });

    expect(fake.oscillators.length).toBe(oscBefore + 1);
    const osc = fake.oscillators.at(-1)!;
    expect(osc.type).toBe("sine");
    expect(osc.frequency.setValueAtTime).toHaveBeenCalled();
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
    // The voice gain (last created) ramps up then decays.
    const gain = fake.gains.at(-1)!;
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it("noise burst creates a buffer source + bandpass filter", () => {
    const fake = makeFakeContext();
    const engine = createStudioAudio({ contextFactory: () => fake.ctx });
    engine.resume();

    engine.noiseBurst({ kind: "noise", freq: 700, sweepTo: 3200, dur: 0.18, gain: 0.3 });

    expect(fake.sources.length).toBe(1);
    expect(fake.filters.length).toBe(1);
    expect(fake.filters[0]?.type).toBe("bandpass");
    expect(fake.sources[0]?.start).toHaveBeenCalled();
  });

  it("when muted, playCue creates zero nodes", () => {
    const fake = makeFakeContext();
    const engine = createStudioAudio({ contextFactory: () => fake.ctx });
    engine.resume();
    fake.raw.createOscillator.mockClear();
    fake.raw.createBufferSource.mockClear();

    engine.setMuted(true);
    playCue(engine, "open");
    playCue(engine, "handoff");

    expect(fake.raw.createOscillator).not.toHaveBeenCalled();
    expect(fake.raw.createBufferSource).not.toHaveBeenCalled();
  });

  it("playCue renders every voice of a multi-voice cue when unmuted", () => {
    const fake = makeFakeContext();
    const engine = createStudioAudio({ contextFactory: () => fake.ctx });
    engine.resume();
    const before = fake.oscillators.length;

    playCue(engine, "drop"); // two oscillator voices

    expect(fake.oscillators.length).toBe(before + STUDIO_CUES.drop.length);
  });
});

// ---- Audio-settings store --------------------------------------------------

describe("audio-settings store", () => {
  afterEach(() => {
    __resetAudioSettings();
    vi.unstubAllGlobals();
    // jsdom has no matchMedia by default; remove any stub we set on window.
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  it("defaults to muted when the user prefers reduced motion", () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(() => ({
      matches: true,
    }));
    expect(getMuted()).toBe(true);
  });

  it("defaults to unmuted when reduced motion is not preferred", () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(() => ({
      matches: false,
    }));
    expect(getMuted()).toBe(false);
  });

  it("tolerates a missing matchMedia (defaults unmuted)", () => {
    // No matchMedia on window — must not throw, treated as no preference.
    expect(getMuted()).toBe(false);
  });

  it("toggleMuted flips and notifies subscribers", () => {
    const cb = vi.fn();
    subscribeMuted(cb);
    expect(getMuted()).toBe(false);

    toggleMuted();
    expect(getMuted()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);

    toggleMuted();
    expect(getMuted()).toBe(false);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("setMuted is change-gated (idempotent set does not emit)", () => {
    const cb = vi.fn();
    subscribeMuted(cb);
    setMuted(true);
    setMuted(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("__resetAudioSettings clears state and subscribers", () => {
    const cb = vi.fn();
    subscribeMuted(cb);
    setMuted(true);
    expect(cb).toHaveBeenCalledTimes(1);

    __resetAudioSettings();
    setMuted(true);
    expect(cb).toHaveBeenCalledTimes(1); // subscriber was cleared
  });
});
