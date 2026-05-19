"use client";

/**
 * Phase 6.1 Plan 06.1-02: HudThinkingRing — radial loader for JARVIS pre-token latency.
 *
 * Renders a 1px --hud-cyan-dim static ring with a --hud-cyan-bright 30° arc tip
 * sweeping clockwise at 1.4s/rotation (via .hud-thinking-sweep keyframe from
 * Plan 01). Surrounds the leading character of the submitted prompt while the
 * agent has connected SSE but hasn't streamed the first token yet.
 *
 * Reduced motion: renders a quarter-fill static ring (arc tip frozen at 12
 * o'clock) — still communicates "working" without rotation.
 *
 * Decorative role + aria-label so SR users get one announcement ("JARVIS is
 * thinking") and the visual is hidden via aria-hidden on the SVGs.
 */

import { useReducedMotion } from "motion/react";

interface HudThinkingRingProps {
  /** Ring diameter in px. Default 32 (surrounding a leading character). */
  size?: number;
  className?: string;
}

export function HudThinkingRing({ size = 32, className = "" }: HudThinkingRingProps) {
  const shouldReduce = useReducedMotion();
  const r = size / 2 - 1;
  const circumference = 2 * Math.PI * r;
  // 30° arc = 1/12 of circumference; gap = remainder.
  const arc = circumference * (30 / 360);
  const gap = circumference - arc;
  const strokeDasharray = `${arc.toFixed(2)} ${gap.toFixed(2)}`;

  return (
    <div
      role="status"
      aria-label="JARVIS is thinking"
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Static dim ring (always rendered) */}
      <svg
        className="absolute inset-0"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--hud-cyan-dim)"
          strokeWidth="1"
          fill="none"
        />
      </svg>
      {/* Rotating arc tip — reduced motion freezes it at top */}
      <svg
        className={`absolute inset-0 ${shouldReduce ? "" : "hud-thinking-sweep"}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
        style={{ transformOrigin: "center" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--hud-cyan-bright)"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          /* Start arc at 12 o'clock (negative-Y is up in SVG) by rotating 90° around center */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </div>
  );
}
