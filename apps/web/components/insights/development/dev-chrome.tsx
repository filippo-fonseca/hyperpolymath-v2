"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DEV-tab console chrome (sesh-sd3, unit-devtab).
 *
 * The DEVELOPMENT tab is a developer console and runs the densest register in
 * the app (jarvis-adjacent): hairline sd plates, micro caps eyebrows,
 * tabular-nums stat readouts, and functional state pills.
 * These primitives are LOCAL to the DEV tab so the console can diverge from the
 * softer LIFE/HABITS/JARVIS insights panels without editing the shared
 * `tile-style` plate. Everything resolves through `--sd-*` tokens in both
 * themes; no glass, no blur, no glow, no serif (DESIGN-SYSTEM §16).
 */

/* --------------------------------------------------------------- panel plate */

/**
 * Panel plate — craft register (jul-29). The console keeps its dense mono
 * typography, but the plate itself normalises onto `.craft-card` so the DEV
 * tab sits on the same raised-white surface as the rest of insights.
 *
 * `.craft-card` is unlayered CSS and beats Tailwind `bg-*` / `border-*` on the
 * same element, so the old `--sd-box` fill and the hand-rolled dark inset
 * hairline are gone rather than fighting it. Elevation is the shadow ladder.
 */
export function DevPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("craft-card rounded-xl p-5", className)}>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ eyebrow */

/** Sanctioned eyebrow (SDC-1 §2.4) — the console's section label register. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
 "text-micro uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Panel heading row: mono eyebrow left, optional trailing node (mono readouts,
 * segmented control) right, baseline-aligned.
 */
export function DevPanelHeader({
  eyebrow,
  right,
  className,
}: {
  eyebrow: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      {right}
    </header>
  );
}

/* -------------------------------------------------------------- stat readout */

/**
 * A single console readout: font-black tabular-nums value over a mono eyebrow.
 * `tone` tints the value (cyan / coral / amber) for a functional headline.
 */
export function StatReadout({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "accent" | "coral" | "amber";
}) {
  const toneColor =
    tone === "accent"
      ? "var(--sd-accent)"
      : tone === "coral"
        ? "var(--ink-coral)"
        : tone === "amber"
          ? "var(--ink-amber)"
          : "var(--sd-ink)";
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-2xl font-black leading-none tabular-nums tracking-[-0.01em]"
        style={{ color: toneColor }}
      >
        {value}
        {unit ? (
          <span className="ml-1 text-meta font-medium text-[var(--sd-ink-faint)]">
            {unit}
          </span>
        ) : null}
      </span>
      <Eyebrow className="tracking-[0.08em]">{label}</Eyebrow>
    </div>
  );
}

/* --------------------------------------------------------------- state pill */

export type PillTone = "accent" | "coral" | "idle" | "amber";

const pillColor: Record<PillTone, string> = {
  accent: "var(--sd-accent)",
  coral: "var(--ink-coral)",
  amber: "var(--ink-amber)",
  idle: "var(--sd-ink-faint)",
};

/**
 * Functional state pill for the pipeline ledger — mono, dot + label, tinted by
 * tone. done = cyan, failed/timed-out = coral, skipped = idle grey. The idle
 * tone stays a flat hairline (no tint) so the ledger reads calm.
 */
export function StatePill({
  tone,
  children,
}: {
  tone: PillTone;
  children: ReactNode;
}) {
  const color = pillColor[tone];
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-micro leading-none tracking-[0.08em]"
      style={
        tone === "idle"
          ? {
              color: "var(--sd-ink-faint)",
              borderColor: "var(--sd-line)",
              backgroundColor: "var(--sd-input)",
            }
          : {
              color,
              borderColor: `color-mix(in srgb, ${color} 32%, var(--sd-line))`,
              backgroundColor: `color-mix(in srgb, ${color} 14%, var(--sd-box))`,
            }
      }
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  );
}

/* ----------------------------------------------------------- calm empty state */

/** Plain, calm empty state — mono eyebrow + ink-faint line. Never italic serif. */
export function DevEmpty({
  heading,
  body,
}: {
  heading: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <Eyebrow>{heading}</Eyebrow>
      {body ? (
        <p className="max-w-prose text-meta leading-relaxed text-[var(--sd-ink-faint)]">
          {body}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- chart tokens */

/**
 * Chart tokens for the DEV spend charts. recharts resolves CSS custom
 * properties as SVG presentation attributes, so passing `var(--sd-*)` keeps the
 * charts correct in BOTH themes (the retired hex literals were light-only
 * parchment values that mis-rendered in dark). Proven by the shipped nutrition
 * MacroTrendChart, the sd chart exemplar.
 */
export const CHART = {
  accent: "var(--sd-accent)",
  amber: "var(--ink-amber)",
  grid: "var(--sd-line)",
  axis: "var(--sd-ink-faint)",
  tooltip: {
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    backgroundColor: "var(--surface-raised)",
    border: "1px solid var(--edge)",
    borderRadius: 12,
    boxShadow: "var(--shadow-pop)",
    color: "var(--sd-ink)",
  } as const,
} as const;
