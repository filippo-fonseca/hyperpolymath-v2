/**
 * studio-audio synth — a tiny, fully-synthesized Web Audio voice engine for the
 * studio's HUD sound cues. No audio asset files: every sound is built from
 * oscillators + a short noise buffer through gain/filter envelopes.
 *
 * Three deliberate properties (mirrors `sync/broadcast.ts`'s injectable seam):
 *  - LAZY: the `AudioContext` is never constructed at module load, nor at
 *    engine creation. It is built on the first `resume()` / first cue after a
 *    user gesture, so autoplay policy is respected and SSR never touches Web
 *    Audio globals.
 *  - INERT ON SERVER / NO-BC: when no context factory is available (SSR, or a
 *    jsdom test with no injected factory) every method is a safe no-op — the
 *    engine degrades to silence with zero call-site branching.
 *  - INJECTABLE: `createStudioAudio({ contextFactory })` accepts a factory so
 *    tests drive a fake AudioContext (a plain graph of `vi.fn` nodes) and assert
 *    scheduling calls without rendering real audio.
 *
 * Envelope hygiene (no drift, no clicks, no loops): every voice's gain starts
 * at 0, ramps up over a short attack, then decays exponentially to a small floor
 * (never 0 — `exponentialRampToValueAtTime(0)` is invalid) by `t + dur`, and the
 * source node is `stop()`ed just after. Nothing loops; every node is one-shot
 * and garbage-collectable.
 */

/** The minimal AudioContext surface the engine depends on. Lets a test inject a
 * fake without pulling in the DOM `AudioContext` lib type. */
export interface StudioAudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: AudioNode;
  readonly sampleRate: number;
  resume(): Promise<void> | void;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  createBiquadFilter(): BiquadFilterNode;
  createBufferSource(): AudioBufferSourceNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  close?(): Promise<void> | void;
}

/** Produces an AudioContext — the seam tests replace. */
export type StudioAudioContextFactory = () => StudioAudioContextLike;

/** A single oscillator voice. `sweepTo` glides the frequency across `dur`. */
export interface BlipSpec {
  kind: "osc";
  type: OscillatorType;
  freq: number;
  /** Exponential glide target reached by `t + dur`. Omit for a steady tone. */
  sweepTo?: number;
  /** Seconds. Kept short (< 0.2) by cue authors. */
  dur: number;
  /** Peak gain of this voice before the master gain. */
  gain: number;
  /** Attack ramp in seconds (default 0.006). */
  attack?: number;
}

/** A short filtered noise burst. */
export interface NoiseSpec {
  kind: "noise";
  dur: number;
  gain: number;
  /** Bandpass centre frequency. */
  freq: number;
  /** Bandpass Q (default 1.4). */
  q?: number;
  /** Sweep the bandpass centre to this frequency by `t + dur` (for whooshes). */
  sweepTo?: number;
  attack?: number;
}

export type VoiceSpec = BlipSpec | NoiseSpec;

export interface StudioAudioEngine {
  /** Create the context if absent and resume it if suspended. Idempotent. */
  resume(): void;
  /** Render one oscillator voice. No-op when muted or inert. */
  blip(spec: BlipSpec): void;
  /** Render one noise-burst voice. No-op when muted or inert. */
  noiseBurst(spec: NoiseSpec): void;
  /** Render any voice by its `kind`. */
  play(spec: VoiceSpec): void;
  /** Fast, click-free master mute (ramps master gain to ~0). */
  setMuted(muted: boolean): void;
  getMuted(): boolean;
  /** True once a context exists (i.e. after a gesture on a supported env). */
  isReady(): boolean;
  /** Tear down: stop, disconnect, close the context. */
  dispose(): void;
}

export interface CreateStudioAudioOptions {
  /** Inject an AudioContext factory (tests / non-standard envs). */
  contextFactory?: StudioAudioContextFactory;
  /** Master gain when unmuted. Low by design — this is feedback, not music. */
  masterGain?: number;
}

const DEFAULT_MASTER_GAIN = 0.18;
/** ~15ms mute ramp — inaudible, click-free. */
const MUTE_RAMP = 0.015;
const GAIN_FLOOR = 0.0001;

/** The default factory: real `AudioContext` when the browser has one, else null
 * (→ inert engine). Never evaluated at module load. */
function defaultContextFactory(): StudioAudioContextFactory | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  return () => new Ctor() as unknown as StudioAudioContextLike;
}

/**
 * Create a studio audio engine. Constructs nothing heavy until `resume()`; safe
 * to call during render / on the server (returns an engine whose methods no-op
 * when no context factory resolves).
 */
export function createStudioAudio(
  options: CreateStudioAudioOptions = {},
): StudioAudioEngine {
  const factory = options.contextFactory ?? defaultContextFactory();
  const masterGainValue = options.masterGain ?? DEFAULT_MASTER_GAIN;

  let ctx: StudioAudioContextLike | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let muted = false;

  /** Ensure the context + master gain exist. Returns null on inert envs. */
  function ensureContext(): StudioAudioContextLike | null {
    if (ctx) return ctx;
    if (!factory) return null;
    ctx = factory();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : masterGainValue;
    master.connect(ctx.destination);
    return ctx;
  }

  /** A short mono white-noise buffer, built once per context. */
  function getNoiseBuffer(context: StudioAudioContextLike): AudioBuffer {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.max(1, Math.floor(context.sampleRate * 0.2));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buffer;
    return buffer;
  }

  function resume(): void {
    const context = ensureContext();
    if (!context) return;
    if (context.state === "suspended") {
      void context.resume();
    }
  }

  function blip(spec: BlipSpec): void {
    if (muted) return;
    const context = ensureContext();
    if (!context || !master) return;

    const t = context.currentTime;
    const attack = spec.attack ?? 0.006;
    const end = t + spec.dur;

    const osc = context.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, t);
    if (spec.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(spec.sweepTo, 1), end);
    }

    const gain = context.createGain();
    gain.gain.setValueAtTime(GAIN_FLOOR, t);
    gain.gain.linearRampToValueAtTime(spec.gain, t + attack);
    gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, end);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(end + 0.03);
  }

  function noiseBurst(spec: NoiseSpec): void {
    if (muted) return;
    const context = ensureContext();
    if (!context || !master) return;

    const t = context.currentTime;
    const attack = spec.attack ?? 0.004;
    const end = t + spec.dur;

    const source = context.createBufferSource();
    source.buffer = getNoiseBuffer(context);

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(spec.freq, t);
    filter.Q.value = spec.q ?? 1.4;
    if (spec.sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(spec.sweepTo, 1), end);
    }

    const gain = context.createGain();
    gain.gain.setValueAtTime(GAIN_FLOOR, t);
    gain.gain.linearRampToValueAtTime(spec.gain, t + attack);
    gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, end);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(end + 0.03);
  }

  function play(spec: VoiceSpec): void {
    if (spec.kind === "osc") blip(spec);
    else noiseBurst(spec);
  }

  function setMuted(next: boolean): void {
    muted = next;
    if (!master || !ctx) return;
    const t = ctx.currentTime;
    // setTargetAtTime gives a fast, click-free exponential approach.
    master.gain.setTargetAtTime(next ? 0 : masterGainValue, t, MUTE_RAMP);
  }

  function getMuted(): boolean {
    return muted;
  }

  function isReady(): boolean {
    return ctx !== null;
  }

  function dispose(): void {
    if (master) {
      try {
        master.disconnect();
      } catch {
        // already disconnected — harmless
      }
    }
    if (ctx?.close) void ctx.close();
    ctx = null;
    master = null;
    noiseBuffer = null;
  }

  return {
    resume,
    blip,
    noiseBurst,
    play,
    setMuted,
    getMuted,
    isReady,
    dispose,
  };
}
