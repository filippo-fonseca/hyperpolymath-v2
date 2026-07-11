import * as React from "react";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { STUDIO_COLORS, STUDIO_MONO, STUDIOLO } from "../tokens";

/** Two-digit, zero-padded string for a clock field. */
function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

const RING_RADIUS = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function ClockWidget(): React.ReactElement {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Align the first tick to the next whole second, then tick once per second.
    let interval: ReturnType<typeof setInterval> | undefined;
    const align = setTimeout(
      () => {
        setNow(new Date());
        interval = setInterval(() => setNow(new Date()), 1000);
      },
      1000 - (Date.now() % 1000),
    );
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);

  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = now.getSeconds();
  const progress = seconds / 60;
  // Sweep dot sits at the head of the arc; start at 12 o'clock (−90°).
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const dotX = 20 + RING_RADIUS * Math.cos(angle);
  const dotY = 20 + RING_RADIUS * Math.sin(angle);

  const dateLine = now
    .toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();

  return (
    <div
      role="img"
      aria-label={`Clock, ${hours}:${minutes}`}
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        justifyContent: "center",
        gap: 14,
        padding: 20,
      }}
    >
      <p
        style={{
          margin: 0,
          color: STUDIO_COLORS.muted,
          fontFamily: STUDIO_MONO,
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
        }}
      >
        {dateLine}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            color: STUDIO_COLORS.text,
            fontFamily: STUDIO_MONO,
            fontWeight: 200,
            fontSize: 64,
            lineHeight: 1,
            letterSpacing: "0.02em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {hours}
          <span style={{ margin: "0 2px", color: STUDIO_COLORS.muted }}>:</span>
          {minutes}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg
            viewBox="0 0 40 40"
            width={40}
            height={40}
            aria-hidden="true"
            style={{
              transition: reduced ? undefined : "transform 0.3s ease",
            }}
          >
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              stroke={STUDIO_COLORS.rule}
              strokeWidth="1.4"
            />
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              stroke={STUDIO_COLORS.accent}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
              transform="rotate(-90 20 20)"
              style={{
                transition:
                  reduced || seconds === 0
                    ? undefined
                    : "stroke-dashoffset 0.3s linear",
              }}
            />
            <circle cx={dotX} cy={dotY} r="2.1" fill={STUDIOLO.fireflyCyan} />
          </svg>
          <span
            style={{
              color: STUDIO_COLORS.accent,
              fontFamily: STUDIO_MONO,
              fontSize: 11,
              letterSpacing: "0.1em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {pad(seconds)}
          </span>
        </div>
      </div>
    </div>
  );
}
