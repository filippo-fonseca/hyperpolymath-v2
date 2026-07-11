export type UiSfxName = "pickup" | "dropSuccess" | "dropDenied";

let context: AudioContext | null = null;

export function sfxEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return window.localStorage.getItem("ui:sfx") !== "off";
  } catch {
    return true;
  }
}

export function playSfx(name: UiSfxName): void {
  if (!sfxEnabled()) return;
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) return;
  context ??= new AudioContextCtor();
  if (context.state === "suspended") void context.resume();

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(name === "pickup" ? 0.055 : 0.08, now + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration(name));
  master.connect(context.destination);

  if (name === "pickup") {
    tone(master, 1200, 980, now, 0.03, "sine");
  } else if (name === "dropSuccess") {
    tone(master, 180, 105, now, 0.08, "sine");
    tone(master, 110, 75, now + 0.018, 0.06, "triangle");
  } else {
    tone(master, 92, 72, now, 0.1, "sawtooth");
  }
}

function tone(
  output: AudioNode,
  startFrequency: number,
  endFrequency: number,
  start: number,
  length: number,
  type: OscillatorType
) {
  if (!context) return;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + length);
  oscillator.connect(output);
  oscillator.start(start);
  oscillator.stop(start + length);
}

function duration(name: UiSfxName): number {
  if (name === "pickup") return 0.03;
  return name === "dropSuccess" ? 0.08 : 0.1;
}
