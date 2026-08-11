"use client";

import { cn } from "@/lib/utils";
import type { Rank } from "@/lib/xp/levels";
import { useEffect, useRef, useState } from "react";

/**
 * The level ring.
 *
 * A stroked SVG arc rather than a bar, because this is the one number the
 * profile page is built around and a ring gives it a centre to sit in. The
 * sweep is driven by `stroke-dashoffset`, which the browser can animate on the
 * compositor, and the gradient is built from the rank's hue so ascending a
 * rank visibly recolours the whole thing.
 *
 * SVG strokes cannot resolve `var(--*)` (the same constraint the recharts
 * series colours run into on /insights), so the arc uses real `hsl()` values
 * derived from the hue. Only the track, which is chrome, uses a token.
 */

type Props = {
  level: number;
  progress: number;
  rank: Rank;
  /** Outer diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  stroke?: number;
  label?: string;
  className?: string;
};

export function LevelRing({
  level,
  progress,
  rank,
  size = 200,
  stroke = 14,
  label,
  className,
}: Props) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Start empty and fill on mount so the ring draws itself in rather than
  // appearing already full. Respect the OS setting for anyone who would rather
  // it did not.
  const [drawn, setDrawn] = useState(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion.current) {
      setDrawn(true);
      return;
    }
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const shown = drawn ? Math.max(0, Math.min(1, progress)) : 0;
  const offset = circumference * (1 - shown);

  const from = `hsl(${rank.hue} 85% 62%)`;
  const to = `hsl(${(rank.hue + 42) % 360} 82% 55%)`;
  const gradientId = `xp-ring-${rank.name.toLowerCase()}-${size}`;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Level ${level}, ${rank.name}, ${Math.round(progress * 100)} percent to the next level`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>

        {/* Track. Chrome, so it follows the theme token. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--edge)"
          strokeWidth={stroke}
          opacity={0.5}
        />

        {/* Sweep. Rotated so it starts at twelve o'clock. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: reduceMotion.current
              ? undefined
              : "stroke-dashoffset 900ms var(--ease-out-quart, cubic-bezier(0.165,0.84,0.44,1))",
          }}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span
          className="font-mono font-semibold tabular-nums leading-none text-[var(--ink)]"
          style={{ fontSize: size * 0.3 }}
        >
          {level}
        </span>
        <span
          className="font-serif uppercase tracking-[0.14em] text-[var(--ink-muted)]"
          style={{ fontSize: Math.max(9, size * 0.058) }}
        >
          {label ?? "Level"}
        </span>
      </div>
    </div>
  );
}
