"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";

export interface AmbientOrbProps {
  /** Diameter in px. Defaults to 320. */
  size?: number;
  /** Opacity ceiling, 0–1. Defaults to 0.5. */
  intensity?: number;
  className?: string;
}

/**
 * Ambient energy source — a soft cyan radial blob that quietly breathes.
 *
 * SINGULARITY REQUIREMENT: render exactly ONE AmbientOrb per major surface.
 * It is the single ambient light source for a screen; scattering several across
 * the same view breaks the control-deck's restrained, layered calm. Position it
 * with `className` (e.g. `absolute -top-20 -right-24`) inside a `relative`,
 * `overflow-hidden` container.
 *
 * The gradient is our own (cyan → transparent, built from `--deck-accent` /
 * `--hud-cyan`); it never references or copies any Spacedrive asset. Only
 * transform + opacity animate, on the `--dur-orb` (~14s) budget. Honors reduced
 * motion via both `useReducedMotion()` (JS) and the `.sd-motion` class (CSS backup).
 */
export function AmbientOrb({ size = 320, intensity = 0.5, className }: AmbientOrbProps) {
  const reduceMotion = useReducedMotion();
  const ceiling = Math.max(0, Math.min(1, intensity));

  const staticStyle = {
    width: size,
    height: size,
    opacity: ceiling,
    background:
      "radial-gradient(circle at center, var(--deck-accent) 0%, color-mix(in oklch, var(--hud-cyan) 40%, transparent) 42%, transparent 72%)",
    filter: "blur(28px)",
  } as const;

  const base = cn(
    "sd-motion pointer-events-none absolute rounded-full",
    className
  );

  if (reduceMotion) {
    return (
      <div
        aria-hidden="true"
        data-testid="ambient-orb"
        className={base}
        style={staticStyle}
      />
    );
  }

  return (
    <motion.div
      aria-hidden="true"
      data-testid="ambient-orb"
      className={base}
      style={staticStyle}
      initial={{ scale: 0.94, x: 0, y: 0, opacity: ceiling * 0.72 }}
      animate={{
        scale: [0.94, 1.06, 0.94],
        x: [0, 14, 0],
        y: [0, -10, 0],
        opacity: [ceiling * 0.72, ceiling, ceiling * 0.72],
      }}
      transition={{
        duration: 14,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "loop",
      }}
    />
  );
}
