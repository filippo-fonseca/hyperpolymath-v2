/**
 * synth.ts — U-18 · The Studiolo · chimes
 *
 * The world's voice, synthesized from nothing. There are NO audio files: every
 * chime is a tiny raw-WebAudio graph (oscillators + gain envelopes + a breath of
 * filtering) built on demand. This honors U-05's decision — SFX are synthesized,
 * not fetched — so boot ships zero audio bytes and there are no licenses to keep.
 *
 * One shared `AudioContext`, created lazily on the FIRST user gesture (browsers
 * refuse to start audio without one). Before that gesture, chime events are
 * dropped silently — no queue, no backlog, no delayed burst of stale bells.
 *
 * Levels are deliberately gentle (candlelight, not arcade): a low master gain, a
 * `DynamicsCompressor` on the bus so a flurry of rapid completions can't clip,
 * plus a same-voice retrigger guard and a hard cap on simultaneous voices.
 *
 * The three voices live in one pentatonic family (VISION §5 "Sound design") so
 * nothing ever clashes: the glass-bell rings A5, the two-note figure rises E5→A5
 * to land on that same bell note, and the cork-pop is an unpitched transient.
 *
 * Nothing here runs per-frame — it is purely event-driven, fired by `worldEvents`
 * `"chime"` (see `Chimes.tsx`). Not gated by `prefers-reduced-motion`: sound is
 * not motion, and PLAN §U-19 keeps the completion bell audible under reduced
 * motion (the ascent becomes a crossfade + bell). Global mute honors the
 * `localStorage['world:muted']` flag (no UI in MVP; default unmuted after gesture).
 */

export type ChimeKind = "glass-bell" | "cork-pop" | "two-note";

/** Master bus level — gentle by design; per-voice gains sit under this. */
const MASTER_GAIN = 0.42;
/** Hard cap on concurrent voices so rapid-fire completions never pile up/clip. */
const MAX_VOICES = 6;
/** Minimum gap between two firings of the SAME voice (ms) — kills phase stacking. */
const MIN_RETRIGGER_MS = 40;
/** Tiny scheduling lead so ramps start cleanly rather than at `currentTime`. */
const LEAD_S = 0.005;

/** Musical constants (Hz), one pentatonic family — see file header. */
const A5 = 880.0;
const E5 = 659.25;

export interface ChimeEngine {
  /** Arm the one-time gesture-unlock listeners (idempotent). */
  installGestureUnlock(): void;
  /** Play a voice. No-op (silent drop) before unlock, when muted, or over cap. */
  play(kind: ChimeKind): void;
  /** Remove listeners and close the AudioContext. Safe to call more than once. */
  dispose(): void;
}

function isMuted(): boolean {
  try {
    return window.localStorage.getItem("world:muted") === "true";
  } catch {
    return false;
  }
}

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

/** A short burst of white noise as an ephemeral buffer source (for the pop click). */
function noiseBurst(ctx: AudioContext, durationS: number): AudioBufferSourceNode {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationS));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  return src;
}

/**
 * glass-bell — the sacred sound (task completion, the spark ascends on this note).
 * A bright celeste/glass ping: an A5 fundamental plus three gently-inharmonic
 * partials, each with its own exponential decay (higher partials die faster, as a
 * real struck bell does), a hair of detune for shimmer, and a soft lowpass so the
 * top stays warm rather than glassy-harsh. Long, lovely, verdigris decay.
 * Returns the longest-lived node so the caller can free its voice slot on end.
 */
function playGlassBell(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
): AudioScheduledSourceNode {
  const voice = ctx.createGain();
  voice.gain.value = 0.85;
  const warm = ctx.createBiquadFilter();
  warm.type = "lowpass";
  warm.frequency.value = 6000;
  voice.connect(warm);
  warm.connect(out);

  const partials = [
    { ratio: 1.0, gain: 1.0, decay: 1.7 },
    { ratio: 2.01, gain: 0.5, decay: 1.1 },
    { ratio: 3.0, gain: 0.26, decay: 0.7 },
    { ratio: 4.17, gain: 0.12, decay: 0.45 },
  ];

  let tail: AudioScheduledSourceNode | null = null;
  let tailStop = 0;
  for (const p of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = A5 * p.ratio;
    osc.detune.value = (Math.random() * 2 - 1) * 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(p.gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.004 + p.decay);
    osc.connect(g);
    g.connect(voice);
    osc.start(t0);
    const stop = t0 + 0.02 + p.decay;
    osc.stop(stop);
    if (stop >= tailStop) {
      tailStop = stop;
      tail = osc;
    }
  }
  // `partials` is non-empty, so `tail` is always assigned.
  return tail as AudioScheduledSourceNode;
}

/**
 * cork-pop — capture created (a firefly blinks into being). A soft, rounded pop:
 * a sine body whose pitch drops fast from ~420→90 Hz (all the "pop" lives in that
 * sweep), plus a tiny band-passed noise transient for the airy click. Lowpassed
 * so it stays pleasant and never harsh. Short and light.
 */
function playCorkPop(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
): AudioScheduledSourceNode {
  const voice = ctx.createGain();
  voice.gain.value = 0.9;
  const soft = ctx.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = 2200;
  voice.connect(soft);
  soft.connect(out);

  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(420, t0);
  body.frequency.exponentialRampToValueAtTime(90, t0 + 0.07);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, t0);
  bodyGain.gain.linearRampToValueAtTime(0.6, t0 + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
  body.connect(bodyGain);
  bodyGain.connect(voice);
  body.start(t0);
  body.stop(t0 + 0.16);

  const click = noiseBurst(ctx, 0.02);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1100;
  bp.Q.value = 0.8;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.12, t0);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
  click.connect(bp);
  bp.connect(clickGain);
  clickGain.connect(voice);
  click.start(t0);
  click.stop(t0 + 0.03);

  return body; // the body outlives the click transient
}

/**
 * two-note — firefly landing / Jarvis routing delivered (the core promise made
 * audible). A gentle rising figure E5→A5 (perfect fourth, pentatonic, resolving
 * onto the bell's own note): two triangle tones, each doubled a soft octave up for
 * a cyan-bright shimmer, short attack, brief release. Affirming, not a fanfare.
 */
function playTwoNote(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
): AudioScheduledSourceNode {
  const voice = ctx.createGain();
  voice.gain.value = 0.7;
  voice.connect(out);

  const notes = [E5, A5];
  const noteDur = 0.16;
  const gap = 0.06;

  let tail: AudioScheduledSourceNode | null = null;
  let tailStop = 0;
  for (let i = 0; i < notes.length; i++) {
    const freq = notes[i];
    const start = t0 + i * (noteDur + gap);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(0.35, start + 0.01);
    env.gain.setValueAtTime(0.35, start + noteDur);
    env.gain.exponentialRampToValueAtTime(0.0001, start + noteDur + 0.14);
    env.connect(voice);

    const fundamental = ctx.createOscillator();
    fundamental.type = "triangle";
    fundamental.frequency.value = freq;
    fundamental.connect(env);

    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = freq * 2;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.28;
    shimmer.connect(shimmerGain);
    shimmerGain.connect(env);

    const stop = start + noteDur + 0.16;
    fundamental.start(start);
    fundamental.stop(stop);
    shimmer.start(start);
    shimmer.stop(stop);
    if (stop >= tailStop) {
      tailStop = stop;
      tail = fundamental;
    }
  }
  // `notes` is non-empty, so `tail` is always assigned.
  return tail as AudioScheduledSourceNode;
}

const VOICES: Record<
  ChimeKind,
  (ctx: AudioContext, out: AudioNode, t0: number) => AudioScheduledSourceNode
> = {
  "glass-bell": playGlassBell,
  "cork-pop": playCorkPop,
  "two-note": playTwoNote,
};

/**
 * Build a chime engine. One engine owns one shared `AudioContext`. The world
 * mounts exactly one (`<Chimes/>`), so this is effectively a singleton with a
 * clean, testable lifetime tied to a React effect rather than module state.
 */
export function createChimeEngine(): ChimeEngine {
  let ctx: AudioContext | null = null;
  let bus: GainNode | null = null; // master gain → compressor → destination
  let installed = false;
  let disposed = false;
  let activeVoices = 0;
  const lastAt: Record<ChimeKind, number> = {
    "glass-bell": 0,
    "cork-pop": 0,
    "two-note": 0,
  };

  function ensureContext(): AudioContext | null {
    if (ctx) return ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    // A gentle limiter so stacked voices stay under 0 dBFS instead of clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);
    bus = master;
    return ctx;
  }

  const unlock = () => {
    const c = ensureContext();
    if (c && c.state === "suspended") void c.resume().catch(() => {});
    removeUnlock(); // one-time — first gesture is enough
  };

  function removeUnlock(): void {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    installed = false;
  }

  return {
    installGestureUnlock(): void {
      if (installed || disposed || typeof window === "undefined") return;
      installed = true;
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);
    },

    play(kind: ChimeKind): void {
      // Silent drop before unlock (no context / not yet running) or when muted.
      if (disposed || !ctx || !bus || ctx.state !== "running") return;
      if (isMuted()) return;

      const nowMs = performance.now();
      if (nowMs - lastAt[kind] < MIN_RETRIGGER_MS) return; // same-voice guard
      if (activeVoices >= MAX_VOICES) return; // concurrency cap
      lastAt[kind] = nowMs;

      const t0 = ctx.currentTime + LEAD_S;
      activeVoices++;
      const tail = VOICES[kind](ctx, bus, t0);
      const release = () => {
        activeVoices = Math.max(0, activeVoices - 1);
      };
      tail.onended = release;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      removeUnlock();
      const c = ctx;
      ctx = null;
      bus = null;
      if (c) void c.close().catch(() => {});
    },
  };
}
