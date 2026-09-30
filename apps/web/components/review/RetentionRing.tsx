"use client";

import { cn } from "@/lib/utils";
import { URGENCY_META, pct, urgencyBand } from "./study-ui";

/**
 * A topic's current retrievability, as a ring.
 *
 * The ring is the one number the whole feature turns on, so it gets a shape
 * rather than a label: you scan a rail of twenty and the shape tells you where
 * to look without reading a single digit. Colour comes from the urgency band,
 * not from the raw percentage, so a fresh `skim` topic at 72% does not shout at
 * you while a `core` topic at the same 72% does.
 */
export function RetentionRing({
  retrievability,
  priority,
  size = 26,
  showLabel = false,
  unstudied = false,
  className,
}: {
  retrievability: number;
  priority: number;
  size?: number;
  showLabel?: boolean;
  /** Never reviewed: the ring is empty and dashed rather than at 0%. */
  unstudied?: boolean;
  className?: string;
}) {
  const band = urgencyBand(priority);
  const color = URGENCY_META[band].color;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, retrievability));

  const title = unstudied
    ? "Never reviewed"
    : `${pct(retrievability)} retention · ${URGENCY_META[band].label}`;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      title={title}
    >
      <svg width={size} height={size} aria-hidden className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--edge)"
          strokeWidth={stroke}
          {...(unstudied ? { strokeDasharray: "2 3" } : {})}
        />
        {!unstudied && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - filled)}
            style={{ transition: "stroke-dashoffset 220ms ease-out" }}
          />
        )}
      </svg>
      {showLabel && (
        <span
          className="absolute text-[9px] font-medium tabular-nums"
          style={{ color: unstudied ? "var(--ink-faint)" : color }}
        >
          {unstudied ? "–" : Math.round(retrievability * 100)}
        </span>
      )}
      <span className="sr-only">{title}</span>
    </span>
  );
}
