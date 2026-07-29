"use client";

import { useMemo } from "react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";

const QUOTES: { text: string; author: string }[] = [
  { text: "Energy is the currency of productivity.", author: "Ali Abdaal" },
  { text: "How you do one thing is how you do everything.", author: "Zen proverb" },
  { text: "We are what we repeatedly do.", author: "Will Durant" },
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "The obstacle is the way.", author: "Marcus Aurelius" },
  { text: "Slow is smooth, smooth is fast.", author: "Navy SEALs" },
  { text: "Make the easy thing the right thing.", author: "—" },
  { text: "Done is the engine of more.", author: "Bre Pettis" },
  { text: "Memento mori.", author: "Stoics" },
  { text: "Per aspera ad astra.", author: "—" },
  { text: "Compounding works in silence.", author: "—" },
  { text: "Direction over speed.", author: "—" },
  { text: "If not now, when?", author: "Hillel the Elder" },
];

interface Props {
  /** Optional override message rendered above the quote. */
  message?: string;
  /** Make the loader full-viewport. Defaults to true; pass false to embed. */
  fullscreen?: boolean;
}

/**
 * GlobalLoader — the canonical Hyperpolymath loading surface.
 *
 * Renders the Kiwi glyph orbiting inside a triple-ring JARVIS halo with a
 * randomized brand quote beneath. Used by `loading.tsx` route fallbacks
 * and any imperative loading state in the (app) shell.
 *
 * Visual contract:
 *   - Centerpiece: KiwiIcon at 56px, cyan-tinted, drop-shadow glow.
 *   - Halo: two counter-rotating cyan rings (rotate 6s / 9s reverse) with
 *     a soft pulsing inner disc behind.
 *   - Backdrop: canvas with a subtle radial cyan wash.
 *   - Quote: serif italic, mono attribution. Picked once per mount.
 */
export function GlobalLoader({ message, fullscreen = true }: Props) {
  // Random quote per mount. Stable across the render lifetime so it doesn't
  // flip while the loader is still on screen.
  const quote = useMemo(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)],
    [],
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message ?? "Loading"}
      className={
        fullscreen
          ? "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--canvas)]"
          : "flex h-full w-full flex-col items-center justify-center bg-[var(--canvas)]"
      }
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 45%, color-mix(in oklch, var(--hud-cyan) 8%, transparent) 0%, transparent 55%)",
      }}
    >
      {/* Halo + Kiwi centerpiece */}
      <div className="relative h-32 w-32">
        {/* Soft pulsing disc behind everything */}
        <div
          className="absolute inset-4 rounded-full hp-loader-pulse"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--hud-cyan) 28%, transparent) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />

        {/* Outer ring — slow CCW rotation, dashed arc */}
        <svg
          className="absolute inset-0 hp-loader-spin-slow"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="color-mix(in oklch, var(--hud-cyan) 70%, transparent)"
            strokeWidth="1"
            strokeDasharray="4 8"
            strokeLinecap="round"
          />
        </svg>

        {/* Middle ring — faster CW rotation, single arc segment */}
        <svg
          className="absolute inset-2 hp-loader-spin-fast"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="color-mix(in oklch, var(--hud-cyan) 90%, transparent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="60 200"
          />
        </svg>

        {/* Inner ring — subtle hairline */}
        <div
          className="absolute inset-6 rounded-full border"
          style={{
            borderColor:
              "color-mix(in oklch, var(--hud-cyan) 35%, transparent)",
          }}
          aria-hidden="true"
        />

        {/* Kiwi at center with floating pulse */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="hp-loader-kiwi"
            style={{
              color: "var(--hud-cyan)",
              filter:
                "drop-shadow(0 0 12px color-mix(in oklch, var(--hud-cyan) 70%, transparent)) drop-shadow(0 0 24px color-mix(in oklch, var(--hud-cyan) 35%, transparent))",
            }}
          >
            <KiwiIcon size={56} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Status word — sentence case per SDC-1 §2.4; the flicker carries the
          telemetric feel now that the caps register is retired. */}
      <div className="mt-8 text-micro font-medium tracking-[0.06em] text-[var(--ink-muted)] hp-loader-flicker">
        {message ?? "Loading"}
      </div>

      {/* Quote — serif italic, hairline divider above attribution */}
      <figure className="mt-6 max-w-md px-6 text-center">
        <blockquote className="text-[15px] leading-[1.55] text-[var(--ink)]">
          &ldquo;{quote.text}&rdquo;
        </blockquote>
        <figcaption className="mt-2 text-micro text-[var(--ink-muted)]">
          — {quote.author}
        </figcaption>
      </figure>
    </div>
  );
}
