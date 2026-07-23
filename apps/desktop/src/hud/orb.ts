// apps/desktop/src/hud/orb.ts
// The single cyan arc-reactor orb (VISION §4). One canvas-drawn orb driven by
// `document.body.dataset.jarvisState` (idle | listening | thinking | speaking)
// plus a live amplitude `level` (0..1). Cyan accent on near-black; restraint is
// the brief — no clutter, calm cross-fades between states.
//
//   idle       — dim ring, slow ~4s breathing pulse.
//   listening  — brighter ring + live mic waveform (level from capture RMS).
//   thinking   — calm indeterminate rotation/shimmer (no jitter).
//   speaking   — waveform driven by TTS output amplitude; warm steady glow.
//
// The module owns a rAF loop and reads its inputs via injected getters so it
// stays decoupled from capture/tts (no import cycle, easy to test/replace).

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

// The single sd accent, canvas-side. The register collapses the HUD to ONE cyan
// (`--sd-accent: oklch(72% 0.13 210)`); the canvas cannot read a CSS var per
// frame, so the same hue is carried here as its sRGB resolution — not the old
// local #00d4ff. Reconciled so orb, ring, and chrome all speak one cyan.
const CYAN = { r: 0, g: 186, b: 209 }; // oklch(72% 0.13 210) → sRGB

interface OrbInputs {
  /** Current FSM state (source of truth for the orb). */
  getState: () => OrbState;
  /** Live mic amplitude 0..1 while listening. */
  getMicLevel: () => number;
  /** Live TTS output amplitude 0..1 while speaking. */
  getSpeakingLevel: () => number;
}

function cyan(alpha: number): string {
  return `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${alpha})`;
}

/**
 * Mount the orb onto a <canvas>. Returns a stop() to cancel the rAF loop.
 * The canvas is sized to its CSS box (device-pixel aware) each frame.
 */
export function mountOrb(canvas: HTMLCanvasElement, inputs: OrbInputs): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let raf = 0;
  let t = 0;
  // Smoothed values for calm cross-fades — nothing snaps (~200-300ms feel).
  let smoothLevel = 0; // eased amplitude
  let ringBright = 0.35; // eased ring brightness toward the state's target
  let rotation = 0; // thinking shimmer rotation

  const targetBrightness = (state: OrbState): number => {
    switch (state) {
      case "listening":
        return 0.85;
      case "speaking":
        return 0.7;
      case "thinking":
        return 0.55;
      default:
        return 0.35;
    }
  };

  function frame(): void {
    raf = requestAnimationFrame(frame);
    t += 1 / 60;

    // Size to CSS box with DPR so the orb is crisp and centered.
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 240;
    const cssH = canvas.clientHeight || 240;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, cssW, cssH);

    const state = inputs.getState();
    const cx = cssW / 2;
    const cy = cssH / 2;
    const baseR = Math.min(cssW, cssH) * 0.28;

    // Ease brightness toward the state's target (cross-fade, ~250ms).
    ringBright += (targetBrightness(state) - ringBright) * 0.08;

    // Amplitude source per state.
    let rawLevel = 0;
    if (state === "listening") rawLevel = inputs.getMicLevel();
    else if (state === "speaking") rawLevel = inputs.getSpeakingLevel();
    smoothLevel += (rawLevel - smoothLevel) * 0.25;

    // Breathing pulse (slow at idle, livelier when active).
    const breathePeriod = state === "idle" ? 4 : 2.4;
    const breathe = 0.5 + 0.5 * Math.sin((t / breathePeriod) * Math.PI * 2);

    // --- Ambient outer glow -------------------------------------------------
    const glowR = baseR * (1.9 + smoothLevel * 0.6 + breathe * 0.15);
    const glow = ctx!.createRadialGradient(cx, cy, baseR * 0.3, cx, cy, glowR);
    glow.addColorStop(0, cyan(0.10 + ringBright * 0.14 + smoothLevel * 0.18));
    glow.addColorStop(0.5, cyan(0.05 + smoothLevel * 0.08));
    glow.addColorStop(1, cyan(0));
    ctx!.fillStyle = glow;
    ctx!.beginPath();
    ctx!.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx!.fill();

    // --- Core disc ----------------------------------------------------------
    const coreR = baseR * (0.5 + breathe * 0.04 + smoothLevel * 0.08);
    const core = ctx!.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, cyan(0.55 * ringBright + smoothLevel * 0.35));
    core.addColorStop(0.7, cyan(0.18 * ringBright));
    core.addColorStop(1, cyan(0));
    ctx!.fillStyle = core;
    ctx!.beginPath();
    ctx!.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx!.fill();

    // --- Main ring ----------------------------------------------------------
    ctx!.lineWidth = 2;
    ctx!.strokeStyle = cyan(0.35 + ringBright * 0.5);
    ctx!.shadowColor = cyan(0.6 * ringBright);
    ctx!.shadowBlur = 12 + smoothLevel * 20;
    ctx!.beginPath();
    ctx!.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx!.stroke();
    ctx!.shadowBlur = 0;

    // --- Amplitude waveform ring (listening + speaking) ---------------------
    if (state === "listening" || state === "speaking") {
      const spokes = 72;
      ctx!.strokeStyle = cyan(0.5 + smoothLevel * 0.4);
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        // Per-spoke amplitude: smooth level modulated by a rolling sinusoid so
        // it reads as a living waveform rather than a uniform pulse.
        const wobble = 0.5 + 0.5 * Math.sin(a * 6 + t * 6);
        const amp = smoothLevel * (0.35 + 0.65 * wobble);
        const rr = baseR * (1.08 + amp * 0.5);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.stroke();
    }

    // --- Thinking shimmer: a rotating arc segment ---------------------------
    if (state === "thinking") {
      rotation += 0.03;
      const arcR = baseR * 1.16;
      ctx!.lineWidth = 2.5;
      ctx!.strokeStyle = cyan(0.6);
      ctx!.shadowColor = cyan(0.7);
      ctx!.shadowBlur = 14;
      ctx!.beginPath();
      ctx!.arc(cx, cy, arcR, rotation, rotation + Math.PI * 0.5);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.arc(cx, cy, arcR, rotation + Math.PI, rotation + Math.PI * 1.5);
      ctx!.stroke();
      ctx!.shadowBlur = 0;
    }
  }

  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
