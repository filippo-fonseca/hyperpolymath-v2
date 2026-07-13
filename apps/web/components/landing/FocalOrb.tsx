"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * FocalOrb — the single glossy focal element of a hero region (Design
 * Constitution §Scout-B: "Canvas ONLY for a single focal orb if we ship
 * one; everything else stays DOM"; §C "at most one glossy accent orb per
 * screen region"). Landing-local; the seed names it `components/ui/ambient`
 * but that module isn't on this base, so it lives under `components/landing/`
 * (the unit fence).
 *
 * It stages a tight radial bloom directly behind whatever focal visual it
 * wraps (`children` — here the brand's HudCoreBubble, which IS the one glossy
 * cyan orb, so no second orb competes). The wide theatrical AmbientGlow field
 * is composed once by the hero itself, so FocalOrb only owns the local light
 * source the headline punches out of. A slow breathing scale reads as a live
 * source; `useReducedMotion()` freezes it flat.
 */

interface FocalOrbProps {
  children: ReactNode;
  className?: string;
}

export function FocalOrb({ children, className = "" }: FocalOrbProps) {
  const reduce = useReducedMotion();

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Tight radial bloom pinned behind the orb so it reads as the light
          source the headline punches out of. Breathes ~4% under motion. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--sd-accent) 44%, transparent), transparent 72%)",
          filter: "blur(30px)",
        }}
        animate={
          reduce
            ? undefined
            : { opacity: [0.72, 1, 0.72], scale: [0.96, 1.04, 0.96] }
        }
        transition={
          reduce
            ? undefined
            : { duration: 7, repeat: Infinity, ease: "easeInOut" }
        }
      />

      {/* The focal visual itself, above the glow. */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
