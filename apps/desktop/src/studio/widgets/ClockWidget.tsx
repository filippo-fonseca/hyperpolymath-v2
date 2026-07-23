import * as React from "react";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ClockIcon } from "@hyperpolymath/ui-icons";

import { SD_ACCENT, SD_FONT, SD_INK, SD_SURFACES } from "../tokens";

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
        alignItems: "center",
        gap: 16,
        padding: 20,
        background: SD_SURFACES.box,
      }}
    >
      {/* Icon-left stat-tile grammar (DS §8): the dimensional icon carries the
          feature identity, the ring below stays for the live seconds. */}
      <ClockIcon size={40} title="Clock" />

      <div style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: 8 }}>
        <p
          style={{
            margin: 0,
            overflow: "hidden",
            color: SD_INK.faint,
            fontFamily: SD_FONT.mono,
            fontSize: 11,
            letterSpacing: "0.1em",
            textOverflow: "ellipsis",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {dateLine}
        </p>

        {/* Space Grotesk, not mono: DS §3 keeps mono for micro-labels only, and
            a 52px display value is the stat-strip value, not a caption. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            color: SD_INK.base,
            fontFamily: SD_FONT.sans,
            fontWeight: 800,
            fontSize: 52,
            lineHeight: 1,
            letterSpacing: "-0.01em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {hours}
          <span style={{ margin: "0 3px", color: SD_INK.faint }}>:</span>
          {minutes}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg viewBox="0 0 40 40" width={40} height={40} aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r={RING_RADIUS}
            fill="none"
            stroke={SD_SURFACES.line}
            strokeWidth="1.4"
          />
          <circle
            cx="20"
            cy="20"
            r={RING_RADIUS}
            fill="none"
            stroke={SD_ACCENT}
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
          <circle cx={dotX} cy={dotY} r="2.1" fill={SD_ACCENT} />
        </svg>
        <span
          style={{
            color: SD_INK.faint,
            fontFamily: SD_FONT.mono,
            fontSize: 11,
            letterSpacing: "0.1em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pad(seconds)}
        </span>
      </div>
    </div>
  );
}
