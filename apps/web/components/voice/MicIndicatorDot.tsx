"use client";

import { cn } from "@/lib/utils";
import type { MicState } from "@/lib/voice/types";

interface Props {
  state: MicState;
  /** Optional AnalyserNode tap for speaking-state amplitude-driven pulse. Plan 04 wires this. */
  analyser?: AnalyserNode | null;
}

/**
 * Phase 7 Plan 07-03 — header mic indicator dot.
 *
 * Renders inside .agent-mode-scope (PersistentNav places it adjacent to ThemeToggle).
 * Cyan vocabulary per Phase 6.1 HUD layer — 5 distinct states.
 *
 * State-to-CSS mapping (verbatim from 07-CONTEXT.md <specifics> lines 139-145):
 *   idle      : --ink-muted opacity 0.4, no motion
 *   listening : --hud-cyan opacity 0.6, slow pulse 1.2s ease-in-out
 *   recording : --hud-cyan opacity 1.0, fast pulse 0.5s
 *   thinking  : --hud-cyan opacity 0.8, continuous glow (no pulse)
 *   speaking  : --hud-cyan opacity 1.0, amplitude-driven via analyser tap (Plan 04 wires)
 *
 * Phase 6.1 globals.css already exports hud-pulse-slow/fast/breathe keyframes
 * so we leverage existing infrastructure.
 *
 * The `data-mic-state` attribute is a grep target for verification and
 * allows CSS targeting: [data-mic-state="recording"] { ... }
 *
 * Plan 04 note: the `analyser` prop path (RAF loop reading getByteFrequencyData
 * and driving scale via inline style) is deferred — Plan 04 wires the AudioContext
 * analyser node. For now, speaking state shows the dot at full cyan opacity with
 * a fast pulse fallback, which is visually coherent and non-broken.
 */

const STATE_CLASS: Record<MicState, string> = {
  idle:
    "opacity-40 bg-[var(--ink-muted)]",
  listening:
    "opacity-60 bg-[var(--hud-cyan)] animate-[hud-pulse-slow_1.2s_ease-in-out_infinite]",
  recording:
    "opacity-100 bg-[var(--hud-cyan)] animate-[hud-pulse-fast_0.5s_ease-in-out_infinite] scale-110",
  thinking:
    "opacity-80 bg-[var(--hud-cyan)] animate-[hud-breathe_1.2s_ease-in-out_infinite]",
  speaking:
    // Plan 04 will replace this with analyser-tap amplitude-driven transform.
    // Until then, full-opacity cyan with fast pulse is visually correct.
    "opacity-100 bg-[var(--hud-cyan)] animate-[hud-pulse-fast_0.5s_ease-in-out_infinite]",
};

export function MicIndicatorDot({ state }: Props) {
  return (
    <span
      aria-label={`JARVIS voice: ${state}`}
      data-mic-state={state}
      className={cn(
        "inline-block w-2 h-2 rounded-full transition-all duration-200 ease-out",
        STATE_CLASS[state],
      )}
    />
  );
}
