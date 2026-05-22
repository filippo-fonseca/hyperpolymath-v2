"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { subscribeToMicState } from "@/lib/voice/mic-state-bus";
import type { MicState } from "@/lib/voice/types";

/**
 * HudCoreBubble — the central arc-reactor visual anchor for the JARVIS Console.
 *
 * Translates the Stark Industries HUD centerpiece (glowing triangle in
 * concentric instrument rings) into a restrained 2026 interpretation:
 * vector strokes, OKLCH cyan glow, slow rotational drift on the outer
 * tick ring, breathing inner glow. Idle = ambient anchor; thinking = adds
 * an arc-tip sweep over the middle ring; streaming = inner core pulse
 * intensifies.
 *
 * Placement: absolutely positioned behind the JARVIS Console scrollback,
 * centered, pointer-events: none. Dominant focal point when scrollback is
 * empty (`dimmed=false`); ambient background when conversation begins
 * (`dimmed=true` collapses opacity).
 *
 * prefers-reduced-motion: all rotation + breathe cease; static composition.
 *
 * Scoped to `.agent-mode-scope` surfaces only — never bleeds onto document
 * surfaces (UI-SPEC §2c, §3f).
 */

export type HudCoreBubbleState = "idle" | "thinking" | "streaming" | "error";

interface Props {
  state?: HudCoreBubbleState;
  dimmed?: boolean;
  className?: string;
}

export function HudCoreBubble({
  state = "idle",
  dimmed = false,
  className = "",
}: Props) {
  const shouldReduce = useReducedMotion();

  // Phase 7 voice-everywhere: bubble reflects the mic FSM AND a wake-burst
  // event JarvisListener fires the moment the user starts addressing JARVIS.
  // Wake-word and press-to-talk both dispatch `jarvis-wake-burst` at the
  // visually-appropriate moment so the burst feels instant regardless of
  // activation channel.
  const [micState, setMicState] = useState<MicState>("idle");
  const [wakeBurstKey, setWakeBurstKey] = useState(0);
  const [tentativelyActive, setTentativelyActive] = useState(false);
  const tentativeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeToMicState(setMicState), []);

  useEffect(() => {
    function handleWakeBurst() {
      setWakeBurstKey((k) => k + 1);
      setTentativelyActive(true);
      // Hold the active visuals for up to 4s — covers the STT round-trip
      // for the wake-word path. If the FSM transitions to recording /
      // thinking / speaking before the timer fires, micActive stays true
      // via fsmActive; the timer is a safety net.
      if (tentativeTimerRef.current) clearTimeout(tentativeTimerRef.current);
      tentativeTimerRef.current = setTimeout(() => {
        setTentativelyActive(false);
        tentativeTimerRef.current = null;
      }, 4000);
    }
    window.addEventListener("jarvis-wake-burst", handleWakeBurst);
    return () => {
      window.removeEventListener("jarvis-wake-burst", handleWakeBurst);
      if (tentativeTimerRef.current) clearTimeout(tentativeTimerRef.current);
    };
  }, []);

  const fsmActive =
    micState === "recording" || micState === "thinking" || micState === "speaking";
  const micActive = fsmActive || tentativelyActive;
  const isActive = state === "thinking" || state === "streaming" || micActive;
  const isError = state === "error";

  // When the user is talking to JARVIS (mic active), the bubble takes over
  // as the focal point: full opacity (override dimmed), scaled up, brighter
  // glow. Returns to ambient when state drops back to listening.
  const baseOpacity = dimmed ? 0.18 : 0.7;
  const effectiveOpacity = micActive ? 1 : baseOpacity;
  const wakeScale = micActive ? 1.45 : 1;
  const stroke = isError ? "var(--ink-coral)" : "var(--hud-cyan)";

  // Outer tick-mark ring: 24 evenly-spaced 6px ticks at r≈124
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const angle = (i * 360) / 24;
    return (
      <line
        key={i}
        x1="140"
        y1="14"
        x2="140"
        y2="22"
        stroke={stroke}
        strokeWidth="1"
        opacity={i % 3 === 0 ? 0.9 : 0.4}
        transform={`rotate(${angle} 140 140)`}
      />
    );
  });

  // Build animation classes: wake burst is a one-shot (keyed remount) and
  // the active throb runs continuously while mic is in recording / thinking
  // / speaking. shouldReduce kills both.
  const animationClasses = shouldReduce
    ? ""
    : micActive
      ? "hud-core-active-throb"
      : "";

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
      style={{
        opacity: effectiveOpacity,
        transform: `scale(${wakeScale})`,
        transformOrigin: "center center",
        transition:
          "opacity 350ms cubic-bezier(0.25, 1, 0.5, 1), transform 450ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <svg
        key={wakeBurstKey}
        viewBox="0 0 280 280"
        width="280"
        height="280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${animationClasses} ${
          !shouldReduce && wakeBurstKey > 0 ? "hud-core-wake-burst" : ""
        }`}
        style={{
          filter: micActive
            ? `drop-shadow(0 0 48px color-mix(in oklch, ${stroke} 70%, transparent))`
            : `drop-shadow(0 0 24px color-mix(in oklch, ${stroke} 35%, transparent))`,
          transition: "filter 350ms ease-out",
        }}
      >
        {/* Soft outward glow disc */}
        <defs>
          <radialGradient id="hud-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.5" />
            <stop offset="40%" stopColor={stroke} stopOpacity="0.15" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hud-core-center" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={stroke} stopOpacity="1" />
            <stop offset="50%" stopColor={stroke} stopOpacity="0.6" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient outward glow */}
        <circle cx="140" cy="140" r="135" fill="url(#hud-core-glow)" />

        {/* Outer instrument-scale ring (slow rotation) */}
        <g
          className={shouldReduce ? "" : "hud-core-rotate-slow"}
          style={{ transformOrigin: "140px 140px" }}
        >
          <circle
            cx="140"
            cy="140"
            r="124"
            stroke={stroke}
            strokeWidth="1"
            opacity="0.6"
          />
          {ticks}
        </g>

        {/* Hairline circle */}
        <circle
          cx="140"
          cy="140"
          r="104"
          stroke={stroke}
          strokeWidth="0.5"
          opacity="0.35"
        />

        {/* Middle ring (thinking arc sweep when active) */}
        <g
          className={
            shouldReduce || !isActive ? "" : "hud-core-rotate-fast"
          }
          style={{ transformOrigin: "140px 140px" }}
        >
          <circle
            cx="140"
            cy="140"
            r="84"
            stroke={stroke}
            strokeWidth="1"
            opacity="0.45"
            strokeDasharray="2 6"
          />
          {/* Arc-tip indicator (only visible when active) */}
          {isActive && (
            <path
              d="M 140 56 A 84 84 0 0 1 196 88"
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.85"
            />
          )}
        </g>

        {/* Inner hairline */}
        <circle
          cx="140"
          cy="140"
          r="64"
          stroke={stroke}
          strokeWidth="0.5"
          opacity="0.4"
        />

        {/* Inner glow disc (breathes) */}
        <circle
          cx="140"
          cy="140"
          r="56"
          fill="url(#hud-core-center)"
          opacity="0.7"
          className={shouldReduce ? "" : "hud-core-breathe"}
          style={{ transformOrigin: "140px 140px" }}
        />

        {/* Central arc-reactor triangle (Stark signature) */}
        <g
          className={shouldReduce ? "" : "hud-core-breathe"}
          style={{ transformOrigin: "140px 140px" }}
        >
          {/* Equilateral triangle pointing up, inscribed in r=32 */}
          <polygon
            points="140,108 168,156 112,156"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill="none"
            opacity="0.9"
          />
          {/* Inner light triangle */}
          <polygon
            points="140,120 158,150 122,150"
            fill={stroke}
            opacity="0.25"
          />
          {/* Central light dot */}
          <circle cx="140" cy="138" r="3" fill={stroke} opacity="1" />
        </g>
      </svg>
    </div>
  );
}
