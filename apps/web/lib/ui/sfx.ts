"use client";

/**
 * sfx.ts — the subtle "space-console" core SFX pack (sesh-sd3, unit-orb-sfx).
 *
 * Eight tiny, pitch-coherent UI cues synthesized at runtime through the shared
 * gesture-unlocked AudioContext (`lib/voice/audio-context`). Zero audio assets:
 * each cue is a short envelope over one or two sine/triangle partials, all
 * derived from a single tonal center so the family reads as one instrument.
 *
 * Design law (UI-CONTRACT-SD3 §2 + seed):
 *   - every cue < 180ms, quiet (peak gain well below the existing chimes),
 *   - pitch-coherent (intervals of one tonal center),
 *   - never stacks (per-cue throttle),
 *   - silent when the AudioContext is locked/absent (no gesture yet),
 *   - global mute persisted at localStorage `ui:sfx` (default ON), exposed as
 *     `isSfxEnabled` / `setSfxEnabled` for a settings toggle another unit wires.
 *
 * Mute reconciliation: an older master mute already ships (`lib/ui/sound-prefs`,
 * key `hp:sfx-muted`) gating the existing chimes. The core pack additionally
 * short-circuits on `isSfxMuted()` so that established master mute silences
 * these cues too — no second "why is it still beeping" surprise. Net:
 *   - `hp:sfx-muted` = master mute (kills chimes AND the core pack),
 *   - `ui:sfx`       = independent toggle for just the subtle core pack.
 */

import { getSharedAudioContext } from "@/lib/voice/audio-context";
import { isSfxMuted } from "@/lib/ui/sound-prefs";

/** Tonal center for the whole family (C5). Cues are intervals of this. */
const TONAL_CENTER_HZ = 523.25;

/** Master ceiling — every cue peaks well under the 0.35-0.4 chime volume. */
const MASTER_GAIN = 0.07;

type Waveform = "sine" | "triangle";

interface Partial {
  /** Semitone offset from the tonal center (may be fractional for detune). */
  semitones: number;
  /** Start offset within the cue, ms. */
  at: number;
  /** Note length, ms. */
  dur: number;
  /** Relative gain 0..1 (scaled by MASTER_GAIN). */
  gain: number;
  wave: Waveform;
}

export type CueName =
  | "sidebarCollapse"
  | "sidebarExpand"
  | "viewToggle"
  | "taskComplete"
  | "captureSent"
  | "habitCheck"
  | "dialogOpen"
  | "error";

/**
 * The cue table. Pure data — importable and assertable without any WebAudio,
 * which is what the unit test checks (durations, coherence). Each cue's total
 * length is `max(at + dur)` and MUST stay < 180ms.
 */
export const CUE_SPECS: Record<CueName, Partial[]> = {
  // Folding in — a soft descending perfect fifth.
  sidebarCollapse: [
    { semitones: 7, at: 0, dur: 60, gain: 0.9, wave: "sine" },
    { semitones: 0, at: 48, dur: 70, gain: 0.9, wave: "sine" },
  ],
  // Opening out — the same fifth, ascending.
  sidebarExpand: [
    { semitones: 0, at: 0, dur: 60, gain: 0.9, wave: "sine" },
    { semitones: 7, at: 48, dur: 80, gain: 0.9, wave: "sine" },
  ],
  // Neutral blip an octave up — quick, weightless.
  viewToggle: [{ semitones: 12, at: 0, dur: 70, gain: 0.8, wave: "sine" }],
  // Reward — a bright major-third → fifth flourish.
  taskComplete: [
    { semitones: 4, at: 0, dur: 60, gain: 0.85, wave: "triangle" },
    { semitones: 7, at: 50, dur: 55, gain: 0.9, wave: "triangle" },
    { semitones: 12, at: 100, dur: 70, gain: 0.8, wave: "sine" },
  ],
  // Sent — a single crisp step up a perfect fourth.
  captureSent: [{ semitones: 5, at: 0, dur: 80, gain: 0.85, wave: "sine" }],
  // Checked — two quick same-note ticks.
  habitCheck: [
    { semitones: 9, at: 0, dur: 38, gain: 0.8, wave: "sine" },
    { semitones: 9, at: 46, dur: 48, gain: 0.85, wave: "sine" },
  ],
  // Surface rising — center up a whole tone.
  dialogOpen: [{ semitones: 2, at: 0, dur: 110, gain: 0.75, wave: "sine" }],
  // Gentle wrongness — a low, slightly detuned minor second (never harsh).
  error: [
    { semitones: -5, at: 0, dur: 130, gain: 0.85, wave: "triangle" },
    { semitones: -6.15, at: 0, dur: 130, gain: 0.55, wave: "triangle" },
  ],
};

/** Total duration of a cue (ms) = last partial end. */
export function cueDurationMs(name: CueName): number {
  return CUE_SPECS[name].reduce((max, p) => Math.max(max, p.at + p.dur), 0);
}

const STORAGE_KEY = "ui:sfx";
const EVENT = "ui:sfx-change";

/** Core-pack toggle. Default ON — only an explicit "0" disables it. */
export function isSfxEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSfxEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // ignore — a blocked localStorage just means the pref doesn't persist
  }
}

/** True when the core pack is allowed to make sound right now. */
function coreAudible(): boolean {
  return isSfxEnabled() && !isSfxMuted();
}

const semitoneToHz = (semitones: number): number =>
  TONAL_CENTER_HZ * Math.pow(2, semitones / 12);

// Per-cue throttle so a cue never stacks on itself (rapid re-fires collapse to
// one). Keyed by cue name; the shortest gap is a touch longer than the longest
// cue so overlaps are impossible.
const THROTTLE_MS = 120;
const lastFiredAt: Partial<Record<CueName, number>> = {};

function nowMs(ctx: AudioContext): number {
  return ctx.currentTime * 1000;
}

/**
 * Fire a cue. No-op (silently) when muted, when the core pack is disabled, or
 * when the shared AudioContext hasn't been unlocked by a gesture yet. Never
 * throws — audio is a nicety and must never break an interaction.
 */
export function playCue(name: CueName): void {
  if (typeof window === "undefined") return;
  if (!coreAudible()) return;

  const ctx = getSharedAudioContext();
  if (!ctx || ctx.state !== "running") return;

  const t = nowMs(ctx);
  const last = lastFiredAt[name] ?? -Infinity;
  if (t - last < THROTTLE_MS) return;
  lastFiredAt[name] = t;

  try {
    const start = ctx.currentTime;
    for (const p of CUE_SPECS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = p.wave;
      osc.frequency.value = semitoneToHz(p.semitones);

      const at = start + p.at / 1000;
      const end = at + p.dur / 1000;
      const peak = MASTER_GAIN * p.gain;

      // Fast attack, exponential decay — a clean "console tick", no click.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(end + 0.02);
    }
  } catch {
    // ignore — WebAudio scheduling failures must never surface to the user
  }
}

/**
 * Convenience facade so call-sites read `sfx.play("sidebarCollapse")`.
 * `enabled` / `setEnabled` mirror the toggle for a settings surface.
 */
export const sfx = {
  play: playCue,
  cues: Object.keys(CUE_SPECS) as CueName[],
  get enabled(): boolean {
    return isSfxEnabled();
  },
  setEnabled: setSfxEnabled,
};
