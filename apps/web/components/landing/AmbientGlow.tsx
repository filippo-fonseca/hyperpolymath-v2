"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * AmbientGlow — the spacedrive.com / Raycast ambient layer, landing-local.
 *
 * Composes the sanctioned campaign glow utilities from globals.css
 * (`.sd-glow-field` / `.sd-glow-wide` / `.sd-glow-core` / `.sd-noise-overlay`,
 * Design Constitution §Scout-B "Ambient glow"): a flat low-alpha accent pill
 * under a giant blur, a tighter hot core, and an SVG-noise de-band overlay.
 * No new tokens, no globals edits — this only arranges the shipped recipe.
 *
 * Motion: a slow (≥24s) drift on the two glow pills via Motion, so the field
 * breathes like the reference site. `useReducedMotion()` freezes it to a
 * static composition — the constitution's hard requirement (§Non-neg 8, D1d).
 * `pointer-events: none` throughout so it never intercepts input, and it must
 * never pull text contrast below AA (callers keep body copy off the hot core).
 */

interface AmbientGlowProps {
  /**
   * How loud the glow reads. `theatrical` is the hero-only full volume
   * (bigger pills, higher alpha via .dark overrides); `ambient` is the
   * quieter in-body register used behind showcase frames.
   */
  intensity?: "theatrical" | "ambient";
  /** Render the feTurbulence de-band overlay. Default true. */
  noise?: boolean;
  className?: string;
}

export function AmbientGlow({
  intensity = "theatrical",
  noise = true,
  className = "",
}: AmbientGlowProps) {
  const reduce = useReducedMotion();

  // Theatrical hero staging runs a larger, hotter field; the ambient body
  // register stays smaller and cooler so it never fights the copy.
  const wide =
    intensity === "theatrical"
      ? { w: "72%", h: "58%", top: "6%" }
      : { w: "56%", h: "48%", top: "12%" };
  const core =
    intensity === "theatrical"
      ? { w: "34%", h: "30%", top: "14%" }
      : { w: "26%", h: "24%", top: "18%" };

  // Reduced-motion → no drift props at all (a frozen plate).
  const drift = reduce
    ? {}
    : {
        animate: { x: ["-4%", "4%", "-4%"], y: ["-2%", "3%", "-2%"] },
        transition: {
          duration: 26,
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
      };
  const driftCounter = reduce
    ? {}
    : {
        animate: { x: ["3%", "-3%", "3%"], y: ["2%", "-2%", "2%"] },
        transition: {
          duration: 32,
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
      };

  return (
    <div className={`sd-glow-field ${className}`} aria-hidden="true">
      <motion.div
        className="sd-glow-wide absolute left-1/2 -translate-x-1/2"
        style={{ width: wide.w, height: wide.h, top: wide.top }}
        {...drift}
      />
      <motion.div
        className="sd-glow-core absolute left-1/2 -translate-x-1/2"
        style={{ width: core.w, height: core.h, top: core.top }}
        {...driftCounter}
      />
      {noise && <div className="sd-noise-overlay" />}
    </div>
  );
}
