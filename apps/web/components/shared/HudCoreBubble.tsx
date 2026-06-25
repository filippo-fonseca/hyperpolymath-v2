"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { subscribeToMicState } from "@/lib/voice/mic-state-bus";
import type { MicState } from "@/lib/voice/types";

/**
 * HudCoreBubble — the central visual anchor for the JARVIS Console (and
 * now also the public landing hero).
 *
 * Concentric instrument rings around a centered stylized kiwi-bird
 * silhouette (the project's original agent name from CLAUDE.md, kept
 * here as a small homage). Vector strokes, OKLCH cyan, slow rotational
 * drift on the outer tick ring, breathing inner glow. Idle = ambient
 * anchor; thinking = adds an arc-tip sweep over the middle ring;
 * streaming = inner core pulse intensifies.
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
  /**
   * Rendered pixel size of the square SVG (default 280). Drives the real
   * layout box — prefer this over a parent `transform: scale()`, which leaves
   * the 280px footprint behind and bleeds the visual onto neighbouring
   * elements.
   */
  size?: number;
}

export function HudCoreBubble({
  state = "idle",
  dimmed = false,
  className = "",
  size = 280,
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
  // Ambient baseline bumped from 0.7 → 0.88 so the kiwi reads as present,
  // not faded, on the landing hero + every other surface that mounts this.
  const baseOpacity = dimmed ? 0.22 : 0.88;
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
        width={size}
        height={size}
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

        {/* Centered kiwi-bird silhouette — Kiwi is the project's original
            agent name (CLAUDE.md). Stylized monoline with round body,
            forward-pointing beak, eye, and two stubby legs. Breathes with
            the inner glow disc. */}
        <g
          className={shouldReduce ? "" : "hud-core-breathe"}
          style={{ transformOrigin: "140px 140px" }}
        >
          {/* Soft dark halo backdrop so the bright kiwi glyph reads as a
              centerpiece against the cyan aura instead of blending into it. */}
          <circle
            cx="140"
            cy="140"
            r="34"
            fill="#020617"
            opacity="0.45"
          />
          <circle
            cx="140"
            cy="140"
            r="34"
            fill={stroke}
            opacity="0.08"
          />
          {/* Kiwi-bird glyph — source: apps/web/public/icons/kiwi-bird.svg.
              Original 24×24 path scaled 2.2× to ~53×53 and centered on
              (140,140) via translate(114, 114). Sits inside the inner
              glow disc (r=56) so the rings still read as instrumentation
              chrome around the centerpiece. Fill inherits the bubble's
              cyan stroke color. */}
          <g
            transform="translate(114 114) scale(2.2)"
            style={{
              filter: `drop-shadow(0 0 8px color-mix(in oklch, ${stroke} 70%, transparent))`,
            }}
          >
            <path
              d="m20.741,5.991c.21-.595.299-1.234.243-1.88-.114-1.326-.812-2.532-1.913-3.309-1.422-1.002-3.378-1.072-4.87-.174-.307.185-.59.403-.841.647-.807.786-2.119,1.723-3.788,1.723h-.794C4.18,2.998.334,6.462.022,10.884c-.174,2.468.725,4.883,2.468,6.625.844.844,1.848,1.484,2.938,1.906l.573,4.583h2.191l-.499-4.04c.271.026.544.04.818.04.201,0,.403-.007.604-.021.447-.032.881-.108,1.305-.209l.529,4.231h2.168l-.706-4.987c2.729-1.469,4.589-4.425,4.589-7.791l.021-2.262c.615-.069,1.187-.271,1.708-.568,3.845,3.229,4.272,8.608,4.272,8.608h1c0-5.446-2.104-9.299-3.259-11.007Zm-3.943.98c-1.025.115-1.798.952-1.798,1.947v2.302c0,3.553-2.647,6.523-6.026,6.761-1.891.131-3.737-.555-5.07-1.887-1.333-1.333-2.021-3.181-1.887-5.071.238-3.379,3.208-6.026,6.761-6.026h.794c1.852,0,3.645-.792,5.183-2.29.141-.137.301-.261.477-.366.823-.495,1.901-.458,2.686.095.627.442,1.008,1.098,1.073,1.846.063.737-.2,1.46-.723,1.983-.398.398-.907.642-1.47.705Zm1.202-2.473c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Z"
              fill={`color-mix(in oklch, ${stroke} 45%, white)`}
              opacity="1"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
